const TOKEN = /\s*(\d+(?:\.\d+)?(?:e[+-]?\d+)?|[()+\-*/%^])/iy;

export function calculateExpression(input: string): number {
  const source = input.trim();
  if (!source || source.length > 240) throw new Error("Enter an expression up to 240 characters.");
  const tokens: string[] = [];
  let index = 0;
  while (index < source.length) {
    TOKEN.lastIndex = index;
    const match = TOKEN.exec(source);
    if (!match || match.index !== index) throw new Error("Expression contains unsupported syntax.");
    tokens.push(match[1]!);
    index = TOKEN.lastIndex;
  }
  let cursor = 0;
  const peek = () => tokens[cursor];
  const take = () => tokens[cursor++];

  function primary(): number {
    const token = take();
    if (token === "(") {
      const value = addSubtract();
      if (take() !== ")") throw new Error("Missing closing parenthesis.");
      return value;
    }
    if (token === "+") return primary();
    if (token === "-") return -primary();
    const value = Number(token);
    if (!Number.isFinite(value)) throw new Error("Invalid number.");
    return value;
  }

  function power(): number {
    const left = primary();
    if (peek() === "^") {
      take();
      return Math.pow(left, power());
    }
    return left;
  }

  function multiplyDivide(): number {
    let value = power();
    while (["*", "/", "%"].includes(peek() ?? "")) {
      const operator = take();
      const right = power();
      if ((operator === "/" || operator === "%") && right === 0) {
        throw new Error("Division by zero is not allowed.");
      }
      value = operator === "*" ? value * right : operator === "/" ? value / right : value % right;
    }
    return value;
  }

  function addSubtract(): number {
    let value = multiplyDivide();
    while (["+", "-"].includes(peek() ?? "")) {
      const operator = take();
      const right = multiplyDivide();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  }

  const result = addSubtract();
  if (cursor !== tokens.length) throw new Error("Expression could not be fully evaluated.");
  if (!Number.isFinite(result)) throw new Error("Result is outside the supported numeric range.");
  return result;
}
