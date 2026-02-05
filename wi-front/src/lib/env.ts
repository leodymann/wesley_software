const apiUrl = import.meta.env.VITE_API_URL as string | undefined;

export const env = {
  API_URL: apiUrl && apiUrl.length > 0 ? apiUrl : "http://127.0.0.1:8000",
};

console.log("VITE_API_URL =", import.meta.env.VITE_API_URL);
console.log("API_URL (usada) =", env.API_URL);
