function throttle(cb, limit) {
    var wait = false;
    return () => {
      if (!wait) {
        requestAnimationFrame(cb);
        wait = true;
        setTimeout(() => {
          wait = false;
        }, limit);
      }
    }
  }