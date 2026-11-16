export type ThemeColors = {
  ink: string;
  muted: string;
  green: string;
  paleGreen: string;
  lime: string;
  paper: string;
  white: string;
  border: string;
  amber: string;
  red: string;
  surfaceMuted: string;
  warning: string;
  greenText: string;
  onGreen: string;
};

const lightColors: ThemeColors = {
  ink: "#18352B",
  muted: "#748179",
  green: "#26543D",
  paleGreen: "#E8F0E7",
  lime: "#C9DF8A",
  paper: "#F7F7F1",
  white: "#FFFFFF",
  border: "#E6E9E0",
  amber: "#F4E7C4",
  red: "#9E4436",
  surfaceMuted: "#EDF0E8",
  warning: "#F8E8DD",
  greenText: "#26543D",
  onGreen: "#DFE9DD",
};

const darkColors: ThemeColors = {
  ink: "#EDF4ED",
  muted: "#B0BDB3",
  green: "#183A2A",
  paleGreen: "#293D30",
  lime: "#C9DF8A",
  paper: "#101A15",
  white: "#1C2A22",
  border: "#34433A",
  amber: "#4A4028",
  red: "#F0A08C",
  surfaceMuted: "#24332A",
  warning: "#49332B",
  greenText: "#D5E9CE",
  onGreen: "#E4ECE4",
};

export function getThemeColors(darkMode: boolean): ThemeColors {
  return darkMode ? darkColors : lightColors;
}
