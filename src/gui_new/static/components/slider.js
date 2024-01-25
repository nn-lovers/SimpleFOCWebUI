/*Slider*/
let current_angle = 0;
let offset_angle = 0;
let offset_angle_endstop = 0;

document.addEventListener("DOMContentLoaded", function () {
    const angle_slider = document.getElementById("angle_slider");
    const angle_slider2 = document.getElementById("angle_slider2");
    const handle2 = document.getElementById("handle2");
    const handle = document.getElementById("handle");
    const slider_cover = document.getElementById("slider_cover");
    const slider_cover2 = document.getElementById("slider_cover2");

    const target_id = document.getElementById("slider-target-id");
    const actual_id = document.getElementById("slider-actual-id");
    const error_id = document.getElementById("slider-error-id");
    const target_value = document.getElementById("target-value");
    const actual_value = document.getElementById("actual-value");
    const error_value = document.getElementById("error-value");
    
    let isDragging = false;
  
    // Calculate angle based on mouse position
    function getAngle(event) {
      const rect = angle_slider.getBoundingClientRect();
      const x = event.clientX - rect.left - rect.width / 2;
      const y = event.clientY - rect.top - rect.height / 2;
      return Math.atan2(y, x);
    }
  
   
    function handle_slide(event) {
      isDragging = true;
      end_stopped_left = false;
      end_stopped_right = false;
      offset_angle = current_angle - getAngle(event);
      handle.style.transition = "none";
      handle.setPointerCapture(event.pointerId);      
    }  
    
    // Handle mouse down on the handle
    angle_slider.addEventListener("mousedown", handle_slide);
    angle_slider2.addEventListener("mousedown", handle_slide);
    handle.addEventListener("mousedown", handle_slide);
    handle2.addEventListener("mousedown", handle_slide);
    slider_cover.addEventListener("mousedown", handle_slide);
    slider_cover2.addEventListener("mousedown", handle_slide);
    
    target_id.addEventListener("mousedown", handle_slide);
    actual_id.addEventListener("mousedown", handle_slide);
    error_id.addEventListener("mousedown", handle_slide);
    target_value.addEventListener("mousedown", handle_slide);
    actual_value.addEventListener("mousedown", handle_slide);
    error_value.addEventListener("mousedown", handle_slide);
    function angleToPercentage(angle){
      const minAngle = 0;
      const maxAngle = Math.PI * 2;
      const normalizedAngle = (angle - minAngle + maxAngle) % (maxAngle);
      return normalizedAngle / maxAngle;
    }
    // Handle mouse move on the document
    function updateSliderValue(percentage) {
      const value = Math.round(remap_angle_percentage_to_slider_range(percentage)*100)/100;      
      request_target_change(value);
    }
    let prev_angle = 0;
    let prev_percentage = 0;
    let end_stopped_left = false;
    let end_stopped_right = false;
    document.addEventListener("mousemove", (event) =>{
      throttle(()=>{
        if (isDragging) {
          const angle = getAngle(event);
          let percentage = angleToPercentage(angle + offset_angle);
          if(end_stopped_right){
            console.log("Stopped");
            const percentage_velocity = percentage - prev_percentage;
            if(percentage_velocity < 0 && Math.abs(percentage_velocity)<0.5){
              console.log("Restart",percentage_velocity);
              //Going left, ignoring the jump (false positive - actually going right)
              end_stopped_right = false;
              end_stopped_left = false;
              end_stopped_right = false;
              prev_angle = 0;
              prev_percentage = 1;
              offset_angle = angle;              
            }else{
              prev_angle = angle;
              prev_percentage = percentage;
            }
            return;
          }else{
            if(percentage > 0.9){
              //At the boundary towards 1
              const velocity = angle-prev_angle;
              if(velocity > 0){
                //If trying to go forward still
                if(percentage > 0.95){
                  //But we are pretty much at the edge
                  end_stopped_right = true;
                  percentage = 1;
                }
              }
            }
            prev_angle = angle;
            prev_percentage = percentage;
            updateSliderValue(percentage);
          }          
        }
      },1)();
    });    
  
    // Handle mouse up on the document
    document.addEventListener("mouseup", function (event) {
      if (isDragging) {
        handle.style.transition = "transform 0.3s";
        isDragging = false;
        handle.releasePointerCapture(event.pointerId);
      }
    });
    zero_target();
  });
