import { parquetReadObjects } from "hyparquet";

export type Row = Record<string, unknown>;

/** Reads a whole Parquet file that is already in memory. hyparquet returns BigInt for int64 columns. */
export async function readParquet(buffer: ArrayBuffer): Promise<Row[]> {
  const file = {
    byteLength: buffer.byteLength,
    slice: (start: number, end?: number) => buffer.slice(start, end),
  };
  return (await parquetReadObjects({ file })) as Row[];
}
