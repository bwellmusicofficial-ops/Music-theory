import { ExpressionGallery } from './expression-gallery';

/**
 * Test harness (dev routes only): one passage for every expression marking, then a realistic one,
 * drawn by the real stave in read mode at the lesson size. /dev/expression
 */
export default function DevExpressionPage() {
  return (
    <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col outline-none">
      <ExpressionGallery />
    </main>
  );
}
