type TypedArray = Int32Array | Uint32Array | Uint16Array | Uint8Array;

/**
 * A typed array that grows as values are appended, for columns whose final length is not known until the file ends
 */
export class Column<T extends TypedArray> {

  private values: T;
  public length = 0;

  constructor(private readonly create: (size: number) => T, initialSize: number = 1024) {
    this.values = create(initialSize);
  }

  public push(value: number): void {
    if (this.length === this.values.length) {
      const grown = this.create(this.values.length * 2);
      grown.set(this.values);
      this.values = grown;
    }

    this.values[this.length++] = value;
  }

  /**
   * The values pushed so far, trimmed to length
   */
  public toArray(): T {
    return this.values.slice(0, this.length) as T;
  }

}

/**
 * Interns strings as small integers so columns of codes can be stored in typed arrays
 */
export class CodeTable {

  private readonly ids = new Map<string, number>();
  public readonly values: string[] = [];

  /**
   * The ID of the code, assigning one if it has not been seen before
   */
  public id(code: string): number {
    let id = this.ids.get(code);

    if (id === undefined) {
      id = this.values.length;
      this.ids.set(code, id);
      this.values.push(code);
    }

    return id;
  }

  /**
   * The ID of the code, or undefined if it has not been seen
   */
  public find(code: string): number | undefined {
    return this.ids.get(code);
  }

  public value(id: number): string {
    return this.values[id];
  }

  public get size(): number {
    return this.values.length;
  }

}
