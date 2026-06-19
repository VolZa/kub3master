export type ParsedSpec =
  | {
      kind: 'rebar';
      diameter: number;
      className?: string;
      length?: number;
    }
  | {
      kind: 'angle';
      width: number;
      height: number;
      thickness: number;
      length?: number;
    }
  | {
      kind: 'plate';
      thickness: number;
      width?: number;
      length?: number;
    }
  | {
      kind: 'pipe_round';
      diameter: number;
      thickness: number;
      length?: number;
    }
  | {
      kind: 'pipe_square';
      width: number;
      height: number;
      thickness: number;
      length?: number;
    }
  | {
      kind: 'beam';
      height: number;
      width: number;
      thickness?: number;
      length?: number;
    }
  | {
      kind: 'channel';
      height: number;
      width: number;
      thickness?: number;
      length?: number;
    }
  | {
      kind: 'concrete';
      className: string;
    }
  | {
      kind: 'assembly';
      name: string;
    }
  | {
      kind: 'unknown';
    };
