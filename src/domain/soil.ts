export function classifySoilTexture(
  sandPercent: number,
  siltPercent: number,
  clayPercent: number,
): string {
  if (siltPercent + 1.5 * clayPercent < 15) return "Sand";
  if (siltPercent + 2 * clayPercent < 30) return "Loamy sand";
  if (
    (clayPercent >= 7 && clayPercent < 20 && sandPercent > 52 && siltPercent + 2 * clayPercent >= 30) ||
    (clayPercent < 7 && siltPercent < 50 && siltPercent + 2 * clayPercent >= 30)
  ) {
    return "Sandy loam";
  }
  if (clayPercent >= 7 && clayPercent < 27 && siltPercent >= 28 && siltPercent < 50) {
    return "Loam";
  }
  if (siltPercent >= 80 && clayPercent < 12) return "Silt";
  if (siltPercent >= 50 && clayPercent < 27) return "Silt loam";
  if (clayPercent >= 20 && clayPercent < 35 && sandPercent > 45 && siltPercent < 28) {
    return "Sandy clay loam";
  }
  if (clayPercent >= 27 && clayPercent < 40 && sandPercent > 20 && sandPercent <= 45) {
    return "Clay loam";
  }
  if (clayPercent >= 27 && clayPercent < 40 && siltPercent >= 40 && sandPercent <= 20) {
    return "Silty clay loam";
  }
  if (clayPercent >= 35 && sandPercent >= 45 && siltPercent < 20) return "Sandy clay";
  if (clayPercent >= 40 && siltPercent >= 40 && sandPercent <= 20) return "Silty clay";
  if (clayPercent >= 40) return "Clay";
  if (sandPercent >= 70) return "Loamy sand";
  if (sandPercent >= 52) return "Sandy loam";
  if (siltPercent >= 50) return "Silt loam";
  return "Loam";
}

export function getSoilTextureColor(textureClass: string | null): string {
  switch (textureClass) {
    case "Sand":
      return "#E8CC91";
    case "Loamy sand":
      return "#D8B77E";
    case "Sandy loam":
      return "#C69A67";
    case "Loam":
      return "#A87953";
    case "Silt":
    case "Silt loam":
      return "#A58C78";
    case "Sandy clay loam":
      return "#986C4C";
    case "Clay loam":
    case "Silty clay loam":
      return "#805D49";
    case "Sandy clay":
      return "#8C543B";
    case "Silty clay":
      return "#6F5142";
    case "Clay":
      return "#5C4037";
    default:
      return "#A58C78";
  }
}
