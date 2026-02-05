const apiUrl = import.meta.env.VITE_API_URL as string | undefined;

export const env = {
  API_URL: apiUrl && apiUrl.length > 0 ? apiUrl : "wesleysoftware-production-e8e6.up.railway.app",
};

console.log("VITE_API_URL =", import.meta.env.VITE_API_URL);
console.log("API_URL (usada) =", env.API_URL);
