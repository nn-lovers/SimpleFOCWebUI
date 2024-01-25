let socket = io();
let max_plot_amount = 1000;
let comms_settings_open = false;
let device_connect_settings_open = false;
let all_coms = [];
let all_tabs = ["controls_panel","parameters_panel","terminal_panel"];

/*Elements*/
const horizontal_slider = document.getElementById("horizontal_slider");
let slider_min = -30;
let slider_max = 30;
 // Update slider value based on angle
 function update_target_display_value(target_value){
    document.getElementById("target-value").innerHTML = target_value;
    updateHorizontalSliderValue(target_value);
    updateSliderAngle(remap_slider_val_to_angle_range(target_value));
}
 function updateHorizontalSliderValue(val){
    document.getElementById("horizontal_slider").value = val;
 }
  function remap_slider_val_to_angle_range(val){
    return Math.PI*2*(val-slider_min) / (Math.abs(slider_min)+Math.abs(slider_max));
 }
 function remap_angle_percentage_to_slider_range(percentage){
    return slider_min + percentage * (Math.abs(slider_min)+Math.abs(slider_max));
 }
  function updateSliderAngle(angle){
    current_angle = angle;    
    handle.style.transform = `translate(-50%, -50%) rotate(${angle-0.77}rad)`;
  }

/*Menu status*/
let topbar_open = false;
let motor_enabled = false;
let sending_live_data = false;
let selected_device = null;
let selected_monitoring_variables = Array(7).fill(false);

Device = (port_name)=>{
    self = {};
    self.port_name = port_name
    self.selected_control_mode = "torque"; //Default
    self.selected_monitoring_variables = Array(7).fill(false);
    self.sending_live_data = false;
    return self;
};
let live_data_plot_initialized = false;
let live_data = {
    "timestamps":[],
    "target":[],
    "volt_q":[],
    "volt_d":[],
    "curr_q":[],
    "curr_d":[],
    "velocity":[],
    "angle":[],
};
initialize_live_data_plot();
function initialize_live_data_plot(){
    let timestamps = [];
    let start_timestamp = new Date().getTime() / 1000;
    for(let i=0;i<max_plot_amount;i++){
        timestamps.push(i+start_timestamp);
    }
    live_data = {
        "timestamps":timestamps,
        "target":Array(max_plot_amount).fill(0),
        "volt_q":Array(max_plot_amount).fill(0),
        "volt_d":Array(max_plot_amount).fill(0),
        "curr_q":Array(max_plot_amount).fill(0),
        "curr_d":Array(max_plot_amount).fill(0),
        "velocity":Array(max_plot_amount).fill(0),
        "angle":Array(max_plot_amount).fill(0),
    };
}
function clear_live_data_plot(){
    live_data = {
        "timestamps":[],
        "target":[],
        "volt_q":[],
        "volt_d":[],
        "curr_q":[],
        "curr_d":[],
        "velocity":[],
        "angle":[],
    };
}


document.getElementById("coms").innerHTML = "";
socket.on("server_response_initialization",(initialization_data)=>{    
    connect_com(initialization_data["connected_port_name"]);

    switch_motor_enable_ui(false);
    switch_send_live_data_ui(false);
});
socket.on("server_response_device_refresh",(data)=>{
    //data is an array
    all_coms = data;
    document.getElementById("coms").innerHTML = "";
    data.forEach(device => {
        let coms_display = `
        <div id="coms_element_${device}" class="coms_element ${device==selected_device ? 'com_connected' : ''}"">
        ${device}
        <button class="${device==selected_device ? 'hidden' : ''}" id='button_connect_com_${device}' 
            onclick="connect_com('${device}')">Connect</button>
        <button id='button_disconnect_com_${device}' 
        class="${device==selected_device ? '' : 'hidden'}"
        onclick="disconnect_com('${device}')">Disconnect</button>
        </div>
        `
        document.getElementById("coms").innerHTML += coms_display;
    });
});
socket.on("server_response_device_status_change",(status)=>{
    switch_motor_enable_ui(status);
});
socket.on("server_response_device_connect",(port_name)=>{
   setup_device_connection(port_name);   
});
socket.on("server_response_device_disconnect",(data)=>{
    document.getElementById(`button_connect_com_${data}`).classList.remove("hidden");
    document.getElementById(`button_disconnect_com_${data}`).classList.add("hidden");
    document.getElementById(`coms_element_${data}`).classList.remove("com_connected");        
});
socket.on("server_response_control_mode_change",(mode)=>{
    [0,1,2,3,4].forEach((control_mode)=>{
        document.getElementById(`control_mode_select_${control_mode}`).classList.remove("control_mode_select_button_active");
    });
    selected_control_mode = mode;
    document.getElementById(`control_mode_select_${selected_control_mode}`).classList.add("control_mode_select_button_active");
});
socket.on("server_response_target_change",(target_value)=>{    
    update_target_display_value(target_value);
});
socket.on("server_response_monitoring_variables_changed",(monitoring_variables)=>{
    selected_monitoring_variables = monitoring_variables;
});
socket.on("server_response_live_data_change",(sending_live_data_status)=>{        
    if(!live_data_plot_initialized){
        clear_live_data_plot();
    }
    live_data_plot_initialized = true;
    switch_send_live_data_ui(sending_live_data_status);
});

socket.on("server_response_live_data",(new_live_data)=>{    
    /*pass*/
    for (let key in live_data) {
        if (new_live_data.hasOwnProperty(key)) {            
            const val = new_live_data[key];            
            live_data[key].push(val);
        }else{
            live_data[key].push(null);
        }
    }    
});

function setup_device_connection(port_name){
    if(!port_name){
        all_coms.forEach((port_name)=>{
            document.getElementById(`coms_element_${port_name}`).classList.remove("com_connected");
            document.getElementById(`button_connect_com_${port_name}`).classList.remove("hidden");
            document.getElementById(`button_disconnect_com_${port_name}`).classList.add("hidden");
        })
        selected_device = null;
    }else{
        document.getElementById(`coms_element_${port_name}`).classList.add("com_connected");
        document.getElementById(`button_connect_com_${port_name}`).classList.add("hidden");
        document.getElementById(`button_disconnect_com_${port_name}`).classList.remove("hidden");
        selected_device = port_name;
    }
}
function subscribe_to_logs(log_name,log_type){
    let log_element = document.getElementById("logs_message_box");
    //Max 3000 characters in console...
    let max_chars = 3000;
    let max_message_len = 100;
    ["INFO","WARNING","ERROR","DEBUG"].forEach((log_severity) =>{
        socket.on(`logging_${log_severity}_${log_name}`,function(message){
            if(message=="UISYSCMD::CLS"){
                //Clear logs
                message = "Awaiting new connection. <br>---------------------------------------------------------------------------------<br><br>";
            }
            if(message.length > max_message_len){
                message = message.slice(0,max_message_len) + "...";
            }
            log_element.innerHTML = `<label class="logging_${log_severity}">|${log_name}| ${message}</label>` + log_element.innerHTML ;
            if(log_element.innerHTML.length > max_chars){
                log_element.innerHTML = log_element.innerHTML.slice(0,max_chars) + "...";
            }
        });
    });        
}

function connect_com(device){    
    if(!device){
        return;
    }
    socket.emit("client_request_connect_com",
        {
            "port_name":device,
            "serial_rate":document.getElementById("serialRateInput").value,
            "serial_byte_size":document.getElementById("byteSizeSelect").value,
            "serial_parity":document.getElementById("paritySelect").value,
            "stop_bits":document.getElementById("stopBitsSelect").value,
        }
    )
}
function disconnect_com(device){
    socket.emit("client_request_disconnect_com",
            {
                "port_name":device
            }
    )
}
function refresh_coms(){
    socket.emit("client_request_device_refresh",{});
}

function set_control_mode(mode){   
    socket.emit("client_request_control_mode_change",{
        "port_name":selected_device,
        "control_mode":mode
    });        
}

function request_target_change(value){
    socket.emit("client_request_target_change",{
        "port_name":selected_device,
        "target_value":value
    });
}

function zero_target(){    
    request_target_change(0);
}
function pull_configuration(){
    socket.emit("client_request_pull_configuration",{
        "port_name":selected_device
    })
}
function toggle_device_status(){
    if(!selected_device){
        return;
    }
    let status;
    if(motor_enabled){
        status = false;
    }else{
        status = true;
    }
    socket.emit("client_request_set_device_status",{
        "port_name":selected_device,
        "device_status":status
    })
}
function request_toggle_live_data(){    
    if(!selected_device){
        return;
    }
    /*Send live data (boolean) to disable or enable sending for the requested COMM port*/
    socket.emit("client_request_send_live_data_data",{
        "port_name":selected_device,
        "request_status":!sending_live_data
    });
}
function update_monitoring_variables(index,checked){
    selected_monitoring_variables[index] = checked;
    socket.emit("client_request_change_monitoring_variables",{
        "port_name":selected_device,
        "monitoring_variables":selected_monitoring_variables
    });
}

function setup_monitor_checkboxes(){
    ["target","volt_q","volt_d","curr_q","curr_d","velocity","angle"].forEach((variable,idx)=>{
        document.getElementById(`${variable}_monitor_checkbox`).onchange = (evt)=>{
            update_monitoring_variables(idx,evt.target.checked);
        };
    });
}
function initiate_connection(){
    socket.emit("client_request_initiate_connection",{});
}
let uplot = makeChart({
    title: "",
    drawStyle: drawStyles.line,
    lineInterpolation: lineInterpolations.spline,
  },);

function toggle_topbar_menu(){
    if(topbar_open){
        document.getElementById("main_logo").classList.remove("no_round_corner_bottom");
        document.getElementById("topbar_dropdown").classList.add("hidden");        
        topbar_open = false;
    }else{        
        document.getElementById("topbar_dropdown").classList.remove("hidden");
        document.getElementById("main_logo").classList.add("no_round_corner_bottom");
        topbar_open = true;
    }
    
}
function switch_motor_enable_ui(status){
    if(status){        
        document.getElementById("enable_motor_toggle").innerHTML = `<button class="button3 enable_motor_toggle button_disable" onclick="toggle_device_status()">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-zap-off"><polyline points="12.41 6.75 13 2 10.57 4.92"></polyline><polyline points="18.57 12.91 21 10 15.66 10"></polyline><polyline points="8 8 3 14 12 14 11 22 16 16"></polyline><line x1="1" y1="1" x2="23" y2="23"></line></svg>
        Disable Motor</button>`;
    }else{
        document.getElementById("enable_motor_toggle").innerHTML = `<button class="button3 enable_motor_toggle button_enable" onclick="toggle_device_status()">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-zap"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
        Enable Motor</button>`;      
    }
    motor_enabled = status;
}
function switch_send_live_data_ui(sending_live_data_status){
    if(sending_live_data_status){
        document.getElementById("send_live_data_toggle").innerHTML = `
        <button  class="button1 button_pause" onclick="request_toggle_live_data();">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-pause"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
        Stop Live Data</button>`;
    }else{
        document.getElementById("send_live_data_toggle").innerHTML = `
        <button  class="button1 button_streaming" onclick="request_toggle_live_data();">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-play"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        Start Live Data</button>`;
    }
    sending_live_data = sending_live_data_status;
}
function switch_tab(tab_name){
    if(!all_tabs.includes(tab_name)){
        return;
    }
    all_tabs.forEach((tab,idx)=>{
        if(tab==tab_name){
            document.getElementById(tab).classList.remove("hidden");
            document.getElementById(`tab${idx+1}`).classList.add("tab_active");
        }else{
            document.getElementById(tab).classList.add("hidden");
            document.getElementById(`tab${idx+1}`).classList.remove("tab_active");
        }
    })
    
};
function toggle_comms_settings(){
    if(comms_settings_open){        
        document.getElementById("comms_configure").classList.add("hidden");
        comms_settings_open = false;
    }else{
        document.getElementById("comms_configure").classList.remove("hidden");
        comms_settings_open = true;
    }        
}
function toggle_device_connect_settings(){
    if(device_connect_settings_open){  
        document.getElementById("device_connect").classList.add("hidden");
        device_connect_settings_open = false;
    }else{
        document.getElementById("device_connect").classList.remove("hidden");
        device_connect_settings_open = true;
    }        
}
setInterval(function() {
    let min_val = -1;
    let max_val = 1;
    for (let key in live_data) {
        if(live_data[key].length > max_plot_amount){
            live_data[key] = live_data[key].slice(live_data[key].length-max_plot_amount,live_data[key].length);
        }
        if(key!="timestamps"){
            const cur_min = Math.min(...live_data[key]);
            const cur_max = Math.max(...live_data[key]);
            
            if(cur_min <= min_val){
                min_val = cur_min;
            }
            if(cur_max >= max_val){
                max_val = cur_max;
            }
        }
}
    uplot.setScale("y", { "min": min_val, "max": max_val });
    uplot.setData([
        live_data["timestamps"],
        live_data["target"],
        live_data["volt_q"],
        live_data["volt_d"],
        live_data["curr_q"],
        live_data["curr_d"],
        live_data["velocity"],
        live_data["angle"],
    ]);
}, 5);

horizontal_slider.addEventListener("input",throttle(()=>{    
    const value = horizontal_slider.value;
    request_target_change(value);
},1));
setup_monitor_checkboxes();
subscribe_to_logs("general","page_logs");
subscribe_to_logs("device_page","page_logs");
subscribe_to_logs("serial_connection","console_logs");
subscribe_to_logs("serial_console","console_logs");
initiate_connection();
switch_tab("parameters_panel");
toggle_device_connect_settings();
update_target_display_value(0);