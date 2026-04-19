export type ParsedSpec =
  | {
      kind: 'rebar';
      diameter: number;
      className?: string;
      length?: number;
    }
  | {
      kind: 'angle'; // кутник
      width: number; // одна полка
      height: number; // друга полка
      thickness: number;
      length?: number;
    }
  | {
      kind: 'plate'; // пластина / полоса
      thickness: number;
      width?: number;
      length?: number;
    }
  | {
      kind: 'pipe_round'; // труба кругла
      diameter: number;
      thickness: number;
      length?: number;
    }
  | {
      kind: 'pipe_square'; // труба профільна
      width: number;
      height: number;
      thickness: number;
      length?: number;
    }
  | {
      kind: 'beam'; // двутавр
      height: number;
      width: number;
      thickness?: number;
      length?: number;
    }
  | {
      kind: 'channel'; // швелер
      height: number;
      width: number;
      thickness?: number;
      length?: number;
    }
  | { kind: 'assembly'; name: string } // 🔥 ДОДАТИ
  | {
      kind: 'unknown';
    };
