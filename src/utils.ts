export const delay = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const removeUrlHash = (url: string) => {
  const hashIndex = url.indexOf('#');
  return hashIndex > 0 ? url.substring(0, hashIndex) : url;
};
