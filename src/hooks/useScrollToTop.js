import { useEffect } from 'react';

/**
 * Custom hook that automatically scrolls to top when dependencies change
 * @param {Array} dependencies - Array of state values to watch for changes
 * @param {Object} options - Configuration options
 * @param {boolean} options.smooth - Whether to use smooth scrolling (default: true)
 * @param {number} options.delay - Delay in milliseconds before scrolling (default: 0)
 * @param {string} options.behavior - Scroll behavior: 'smooth' or 'auto' (default: 'smooth')
 * @param {number} options.top - Top position to scroll to (default: 0)
 */
const useScrollToTop = (dependencies = [], options = {}) => {
  const {
    smooth = true,
    delay = 0,
    behavior = 'smooth',
    top = 0
  } = options;

  useEffect(() => {
    // Skip on initial mount (when dependencies are undefined/null)
    if (dependencies.some(dep => dep === undefined || dep === null)) {
      return;
    }

    const scrollToTop = () => {
      window.scrollTo({
        top,
        left: 0,
        behavior: smooth ? behavior : 'auto'
      });
    };

    if (delay > 0) {
      const timeoutId = setTimeout(scrollToTop, delay);
      return () => clearTimeout(timeoutId);
    } else {
      scrollToTop();
    }
  }, dependencies); // eslint-disable-line react-hooks/exhaustive-deps
};

export default useScrollToTop;
