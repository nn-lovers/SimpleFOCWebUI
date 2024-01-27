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
function round_to_digit(num,digitNum){
  const div = Math.pow(10,digitNum);
  return Math.round(num*div)/div;
}
function set_batch_visibility(className,visibility,visibilityClassName){
  const elements = document.getElementsByClassName(className);
  const to_remove = [];
  for (var i = 0; i < elements.length; i++) {
      if(visibility){
          elements[i].classList.remove(visibilityClassName);
      }else{
          elements[i].classList.add(visibilityClassName);
      }
  }
  to_remove.forEach((element)=>{
    element.remove();
  })
}