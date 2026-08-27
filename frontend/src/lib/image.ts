export function resizeImage(file: File, max = 384): Promise<File> {
  return prepareImage(file, max, false);
}

export function prepareStorePhoto(file: File, max = 640): Promise<File> {
  return prepareImage(file, max, true);
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.readAsDataURL(file);
  });
}

function prepareImage(file: File, max: number, square: boolean): Promise<File> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      const source = square ? Math.min(image.width, image.height) : 0;
      const sx = square ? Math.round((image.width - source) / 2) : 0;
      const sy = square ? Math.round((image.height - source) / 2) : 0;
      const sw = square ? source : image.width;
      const sh = square ? source : image.height;
      const scale = Math.min(1, max / Math.max(sw, sh));
      const width = Math.round(sw * scale);
      const height = Math.round(sh * scale);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Não foi possível processar a imagem."));
        return;
      }
      ctx.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);
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
        0.9,
      );
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Arquivo de imagem inválido."));
    };
    image.src = url;
  });
}
