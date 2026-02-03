from __future__ import annotations

from freezegun import freeze_time


@freeze_time("2026-01-30")
def test_full_flow_promissory(client):
    # 1) cria user
    r = client.post("/users", json={
        "name": "pablo",
        "email": "p@gmail.com",
        "password": "123456",
        "role": "STAFF"
    })
    assert r.status_code == 201, r.text
    user_id = r.json()["id"]

    # 2) cria client
    r = client.post("/clients", json={
        "name": "robisvaldo",
        "phone": "5583987157461",
        "cpf": "01234567890",
        "address": "rua do barro",
        "notes": "pagador"
    })
    assert r.status_code == 201, r.text
    client_id = r.json()["id"]

    # 3) cria product
    r = client.post("/products", json={
        "brand": "honda",
        "model": "bros",
        "year": 2026,
        "plate": None,
        "chassi": "ABC123ABC1",
        "km": 100,
        "color": "Azul",
        "cost_price": 10,
        "sale_price": 20,
        "status": "IN_STOCK"
    })
    assert r.status_code == 201, r.text
    product_id = r.json()["id"]

    # 4) cria sale PROMISSORY (gera promissory + installments)
    r = client.post("/sales", json={
        "client_id": client_id,
        "user_id": user_id,
        "product_id": product_id,
        "total": 1000,
        "discount": 0,
        "entry_amount": 200,
        "payment_type": "PROMISSORY",
        "installments_count": 4,
        "first_due_date": None
    })
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["sale"]["status"] == "DRAFT"
    assert body["sale"]["payment_type"] == "PROMISSORY"
    assert body["promissory"] is not None

    prom_id = body["promissory"]["id"]

    # 5) produto virou SOLD
    r = client.get(f"/products/{product_id}")
    assert r.status_code == 200
    assert r.json()["status"] == "SOLD"

    # 6) buscar promissory
    r = client.get(f"/promissories/{prom_id}")
    assert r.status_code == 200
    prom = r.json()
    assert prom["status"] == "DRAFT"
    assert prom["total"] in ("1000.00", "1000")  # depende da serialização

    # 7) listar installments
    r = client.get(f"/installments?promissory_id={prom_id}")
    assert r.status_code == 200, r.text
    inst = r.json()
    assert len(inst) == 4

    # 1 mês após 2026-01-30 -> 2026-02-28 (regra de fim de mês)
    assert inst[0]["due_date"] == "2026-02-28"

    # 8) pagar a primeira parcela
    first_inst_id = inst[0]["id"]
    r = client.post(f"/installments/{first_inst_id}/pay", json={"paid_amount": 200})
    assert r.status_code == 200, r.text
    paid = r.json()
    assert paid["status"] == "PAID"

    # 9) emitir promissory
    r = client.post(f"/promissories/{prom_id}/issue")
    assert r.status_code == 200, r.text
    issued = r.json()
    assert issued["status"] in ("ISSUED", "PAID")  # depende se você marca PAID ao final
