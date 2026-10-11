import LaunchApp from "./launch-app";
import { designLaunch, quoteTrade } from "@/lib/launch-engine";
import { DEFAULT_INPUTS } from "@/lib/launch-types";

const design = designLaunch(DEFAULT_INPUTS);
const quote = quoteTrade(DEFAULT_INPUTS, design.selected.weights, 50, "buy", DEFAULT_INPUTS.orderSize, 100);

export default function Home() {
  return <LaunchApp initialDesign={design} initialQuote={quote} />;
}
