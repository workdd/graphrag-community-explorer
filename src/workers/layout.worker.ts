import { computeLayout, type LayoutJob } from "../core/graph/headlessLayout";

self.onmessage = (event: MessageEvent<LayoutJob>) => {
  self.postMessage(computeLayout(event.data));
};
