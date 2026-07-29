import { describe, expect, test } from "bun:test";
import {
  ACTION_CONCURRENCY,
  KeyedSerialQueue,
  REFRESH_CONCURRENCY,
  runLimited,
} from "../src/lib/concurrency";

describe("global concurrency", () => {
  test("uses the practical desktop limits", () => {
    expect(REFRESH_CONCURRENCY).toBe(12);
    expect(ACTION_CONCURRENCY).toBe(6);
  });

  test("runLimited never exceeds its limit", async () => {
    let active = 0;
    let peak = 0;

    await runLimited([1, 2, 3, 4, 5, 6], 3, async () => {
      active += 1;
      peak = Math.max(peak, active);
      await Bun.sleep(5);
      active -= 1;
    });

    expect(peak).toBe(3);
  });
});

describe("per-repository serialization", () => {
  test("serializes the same repository but runs different repositories concurrently", async () => {
    const queue = new KeyedSerialQueue<string>();
    const activeByRepo = new Map<string, number>();
    let crossRepoPeak = 0;
    let activeTotal = 0;

    const run = (repo: string) =>
      queue.run(repo, async () => {
        const repoActive = (activeByRepo.get(repo) ?? 0) + 1;
        activeByRepo.set(repo, repoActive);
        activeTotal += 1;
        crossRepoPeak = Math.max(crossRepoPeak, activeTotal);
        expect(repoActive).toBe(1);
        await Bun.sleep(5);
        activeByRepo.set(repo, repoActive - 1);
        activeTotal -= 1;
      });

    await Promise.all([run("a"), run("a"), run("b")]);
    expect(crossRepoPeak).toBe(2);
  });

  test("continues after a rejected operation", async () => {
    const queue = new KeyedSerialQueue<string>();
    const order: string[] = [];

    const first = queue.run("a", async () => {
      order.push("first");
      throw new Error("expected");
    });
    const second = queue.run("a", async () => {
      order.push("second");
    });

    await expect(first).rejects.toThrow("expected");
    await second;
    expect(order).toEqual(["first", "second"]);
  });
});
