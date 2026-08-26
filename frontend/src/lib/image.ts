export function resizeImage(file: File, max = 384): Promise<File> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, max / Math.max(image.width, image.height));
      const width = Math.round(image.width * scale);
      const height = Math.round(image.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Não foi possível processar a imagem."));
        return;
      }
      ctx.drawImage(image, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Não foi possível processar a imagem."));
            return;
          }
          resolve(
            new File([blob], "avatar.jpg", {
              type: "image/jpeg",
              lastModified: Date.now(),
            }),
          );
        },
        "image/jpeg",
        0.86,
      );
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Arquivo de imagem inválido."));
    };
    image.src = url;
  });
}
