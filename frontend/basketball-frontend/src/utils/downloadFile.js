export function getFilenameFromDisposition(disposition, fallback = "download.pdf") {
  if (!disposition) return fallback;

  const utfMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) {
    try {
      return decodeURIComponent(utfMatch[1]);
    } catch {
      return utfMatch[1];
    }
  }

  const basicMatch = disposition.match(/filename="?([^";]+)"?/i);
  return basicMatch?.[1] || fallback;
}

export function downloadBlobResponse(response, fallbackFilename = "download.pdf") {
  const filename = getFilenameFromDisposition(
    response?.headers?.["content-disposition"],
    fallbackFilename,
  );

  const blob = response?.data instanceof Blob
    ? response.data
    : new Blob([response?.data], { type: "application/pdf" });

  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}
