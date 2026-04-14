const API_URL = "https://api.example.com";

function fetchData(id: number): Promise<any> {
  return fetch(`${API_URL}/data/${id}`).then((res) => res.json());
}

export function processItems(items: string[]): string[] {
  console.log("processing items");
  return items.filter((item) => item.length > 0);
}
