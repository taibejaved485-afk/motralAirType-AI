export interface Key {
  id: string;
  label: string;
  value: string;
  width?: number; // Relative width (1 = standard key)
  type?: 'char' | 'action';
}

export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

export enum AppState {
  LOADING = 'LOADING',
  READY = 'READY',
  ERROR = 'ERROR'
}

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}
