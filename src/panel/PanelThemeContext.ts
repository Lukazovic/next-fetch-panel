import { createContext } from "react";
import { THEME_CLASS_LIGHT } from "./panel.constants";

export const PanelThemeContext = createContext<string>(THEME_CLASS_LIGHT);
