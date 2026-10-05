// Host extensions expose explicit values, never arbitrary JavaScript objects.
export class NativeValue {
  constructor(typeName) {
    this.typeName = typeName;
  }
  inspect() {
    return `<${this.typeName}>`;
  }
  property(name) {
    throw new Error(`Unknown property '${name}' on ${this.typeName}.`);
  }
}
