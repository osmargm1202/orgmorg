interface InkKey {
  return?: boolean;
  backspace?: boolean;
  delete?: boolean;
  escape?: boolean;
  ctrl?: boolean;
  meta?: boolean;
}

export interface TextInputUpdate {
  value: string;
  submitted: boolean;
  canceled: boolean;
}

export function updateTextInput(current: string, input: string, key: InkKey): TextInputUpdate {
  if (key.return) {
    return {
      value: current,
      submitted: true,
      canceled: false
    };
  }

  if (key.escape) {
    return {
      value: '',
      submitted: false,
      canceled: true
    };
  }

  if (key.backspace || key.delete) {
    return {
      value: current.slice(0, -1),
      submitted: false,
      canceled: false
    };
  }

  if (!input || key.ctrl || key.meta) {
    return {
      value: current,
      submitted: false,
      canceled: false
    };
  }

  return {
    value: `${current}${input}`,
    submitted: false,
    canceled: false
  };
}

export function resolveNumericSelection(input: string, totalItems: number): number | undefined {
  const numeric = Number.parseInt(input, 10);
  if (!Number.isInteger(numeric)) {
    return undefined;
  }

  if (numeric < 1 || numeric > totalItems) {
    return undefined;
  }

  return numeric - 1;
}
