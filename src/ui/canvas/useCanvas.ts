// Keeps a canvas as sharp as the screen and repaints it when its size, its data or the theme changes.
import { type Ref, type WatchSource, onBeforeUnmount, onMounted, watch } from "vue";
import { themeRevision } from "./theme.ts";

/** `paint` draws in CSS pixels on a cleared canvas. The returned function asks for a repaint on the next frame. */
export function useCanvas(
  canvas: Ref<HTMLCanvasElement | undefined>,
  paint: (context: CanvasRenderingContext2D, width: number, height: number) => void,
  sources: WatchSource[] = [],
): () => void {
  let frame = 0;
  const repaint = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const element = canvas.value;
      if (!element) return;
      const { clientWidth: width, clientHeight: height } = element;
      if (width === 0 || height === 0) return;
      const ratio = devicePixelRatio || 1;
      // Setting the size clears the canvas, also when it is unchanged.
      element.width = Math.round(width * ratio);
      element.height = Math.round(height * ratio);
      const context = element.getContext("2d")!;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      paint(context, width, height);
    });
  };
  const resized = new ResizeObserver(repaint);
  onMounted(() => {
    if (canvas.value) resized.observe(canvas.value);
    repaint();
  });
  onBeforeUnmount(() => {
    resized.disconnect();
    cancelAnimationFrame(frame);
  });
  watch([...sources, themeRevision], repaint, { flush: "post" });
  return repaint;
}
