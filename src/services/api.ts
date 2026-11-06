const wait = (ms = 180) => new Promise((resolve) => setTimeout(resolve, ms));

export async function mockResponse<T>(data: T): Promise<T> {
  await wait();
  return structuredClone(data);
}
