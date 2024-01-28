let socket = io();
let max_plot_amount = 1000;
let comms_settings_open = false;
let device_connect_settings_open = false;
let all_coms = [];
let all_tabs = ["controls_panel","parameters_panel","terminal_panel"];
let default_save_path = "saved_configurations";
let notifier = new AWN();
let save_configuration_modal = new AWN().modal(
    `<div class='configuration_save_modal' ><h3>Configuration save name:</h3><br>
    <input placeholder='type here' type='text' id='name_for_save' onkeydown="if(event.key=='Enter'){save_configuration(this.value)}"><br>
    <label>File will be saved '${default_save_path}' folder</label>
    <br>
    <br>
    <button class='button1' onclick="save_configuration(document.getElementById('name_for_save').value)">
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-save"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
    Confirm and save</button>
    </div>
    `,
)
save_configuration_modal.el.classList.add("hidden");
let log_severity_controls = {
    "info":true,
    "warning":false,
    "error":false,
    "debug":false
}
let log_controls = {
    "page_logs":true,
    "console_logs":false,
}
let current_monitor_values = {};
let monitoring_variable_names = ["target","volt_q","volt_d","curr_q","curr_d","velocity","angle"];

/*Elements*/
const horizontal_slider = document.getElementById("horizontal_slider");
let slider_min = -1;
let slider_max = 1;
 // Update slider value based on angle
 function update_target_display_value(target_value){    
    target_value = round_to_digit(target_value,2);
    updateHorizontalSliderValue(target_value);
    updateSliderAngle(remap_slider_val_to_angle_range(target_value));
}
function update_actual_target_value(target_value){
    target_value = round_to_digit(target_value,2);
    document.getElementById("target-value").innerHTML = target_value;
    document.getElementById("target_value_input").value = target_value;
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
    const handle = document.getElementById("handle");
    current_angle = angle;
    handle.style.transform = `translate(-50%, -50%) rotate(${angle-0.77}rad)`;
}
function updateSliderActualIndicatorAngle(angle){
    const handle = document.getElementById("handle2");
    handle.style.transform = `translate(-50%, -50%) rotate(${angle-0.77}rad)`;
}


/*Menu status*/
let topbar_open = false;
let motor_enabled = false;
let sending_live_data = false;
let selected_device = null;
let selected_torque_mode = 0;
let selected_control_mode = 0;
let selected_monitoring_variables = Array(7).fill(false);

/*
TODO: Put device info in a class
Device = (port_name)=>{
    self = {};
    self.port_name = port_name
    self.selected_control_mode = "torque"; //Default
    self.selected_monitoring_variables = Array(7).fill(false);
    self.sending_live_data = false;
    return self;
};*/

let live_data_plot_initialized = false;
let live_data = initialize_live_data();
function initialize_live_data(){
    let timestamps = [];
    let start_timestamp = new Date().getTime() / 1000;
    for(let i=0;i<max_plot_amount;i++){
        timestamps.push(i+start_timestamp);
    }
    const live_data = {
        "timestamps":timestamps,
    };
    monitoring_variable_names.forEach((variable_name)=>{
        live_data[variable_name] = Array(max_plot_amount).fill(0)
    });    
    return live_data;
}
function clear_live_data_plot(){
    live_data = {
        "timestamps":[],       
    };
    monitoring_variable_names.forEach((variable_name)=>{
        live_data[variable_name] = [];
    });
}
function change_maxplot_amount(amount){    
    if(amount || amount == 0){
        amount = Math.round(amount);
        max_plot_amount = amount;
        document.getElementById("max_plot_amount").value = amount;
    }
};
document.getElementById("coms").innerHTML = "";
function initialize_device_params(device_params){
    for (let key in device_params) {
        document.getElementById(key).value = device_params[key];
    }
}
socket.on("server_response_device_params_sync",(device_params)=>{
    initialize_device_params(device_params);
});
socket.on("server_response_configuration_saved",(save_name)=>{
    save_configuration_modal.el.classList.add("hidden");
    notifier.success(`Configuration ${save_name} saved success!`);            
    setTimeout(() => notifier.closeToasts(), 5000);
});
socket.on("server_response_initialization",(initialization_data)=>{
    connect_com(initialization_data["connected_port_name"]);

    initialize_device_params(initialization_data["device_params"]);
    default_save_path = initialization_data["default_save_path"];
    set_device_connected_status(initialization_data["connected_port_name"]);
    if(initialization_data["live_data_syncing"]){        
        if(!live_data_plot_initialized){
            clear_live_data_plot();
        }
        live_data_plot_initialized = true;
        switch_send_live_data_ui(true);
    }    
    document.getElementById('hosting_ip_address').innerText = initialization_data["hosting_ip_address"];
    document.getElementById("control_loop_torque_mode_select").value = initialization_data["torque_mode"];
    switch_monitoring_variables_display(initialization_data["monitoring_ariables"]);    
    switch_motor_enable_ui(false);
    set_target_minmax_value(-1,1);
    set_control_mode(initialization_data["control_loop_mode"]);
    document.getElementById("control_loop_mode_select").value = initialization_data["control_loop_mode"];    
    if(Math.abs(initialization_data["current_target"]) > slider_max){
        document.getElementById("target_minmax_input").value = Math.abs(initialization_data["current_target"]);
        update_target_minmax_displays();
    }
    update_target_display_value(initialization_data["current_target"]);
    update_actual_target_value(initialization_data["current_target"]);    
});
socket.on("server_response_device_refresh",(data)=>{
    //data is an array
    all_coms = data;
    if(data.length==0){
        document.getElementById("coms").innerHTML = "No Devices Found...";
    }else{
        document.getElementById("coms").innerHTML = "";
    }
    data.forEach(device => {
        let coms_display = `
        <div id="coms_element_${device}" class="coms_element ${device==selected_device ? 'com_connected' : ''}"">
        ${device}
        <button class="button5 button_enable ${device==selected_device ? 'hidden' : ''}" id='button_connect_com_${device}' 
            style='width:100px !important;'
            onclick="connect_com('${device}')">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-plus-circle"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
            Connect</button>
        <button id='button_disconnect_com_${device}' 
        class="button5 button_disable ${device==selected_device ? '' : 'hidden'}"
        style='width:100px !important;'
        onclick="disconnect_com('${device}')">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-minus-circle"><circle cx="12" cy="12" r="10"></circle><line x1="8" y1="12" x2="16" y2="12"></line></svg>
        Disconnect</button>
        </div>
        `
        document.getElementById("coms").innerHTML += coms_display;
    });
});
socket.on("server_response_device_status_change",(status)=>{
    switch_motor_enable_ui(status);
});
socket.on("server_response_device_connect",(data)=>{
   setup_device_connection(data["port_name"]);   
   initialize_device_params(data["device_params"]);
   set_device_connected_status(true);
});
socket.on("server_response_device_disconnect",(data)=>{
    document.getElementById(`button_connect_com_${data}`).classList.remove("hidden");
    document.getElementById(`button_disconnect_com_${data}`).innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-minus-circle"><circle cx="12" cy="12" r="10"></circle><line x1="8" y1="12" x2="16" y2="12"></line></svg>
    Disconnect`;
    document.getElementById(`button_disconnect_com_${data}`).classList.add("hidden");
    document.getElementById(`coms_element_${data}`).classList.remove("com_connected");
    set_device_connected_status(false);
});
socket.on("server_response_sensor_zero_offset",()=>{
    
});
socket.on("server_response_pull_configuration",()=>{
    notifier.success(`Configuration Pulled Success.`);            
    setTimeout(() => notifier.closeToasts(), 5000);
});
socket.on("server_response_push_configuration",()=>{
    notifier.success(`Configuration Pushed Success.`);            
    setTimeout(() => notifier.closeToasts(), 5000);
});
socket.on("server_response_control_torque_mode_change",(mode)=>{
    selected_torque_mode = mode;
    document.getElementById("control_loop_torque_mode_select").value = mode;
});
socket.on("server_response_control_mode_change",(mode)=>{
    selected_control_mode = mode;
    document.getElementById("control_mode_select").value = mode;
});
socket.on("server_response_target_change",(target_value)=>{    
    update_actual_target_value(target_value);
});
socket.on("server_response_monitoring_variables_changed",(monitoring_variables)=>{
    switch_monitoring_variables_display(monitoring_variables);
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
    current_monitor_values = new_live_data;
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
function toggle_log_severity_control(severity,clear){
    log_severity_controls[severity] = !log_severity_controls[severity];
    if(clear){
        set_batch_visibility(`logging_${severity}`,log_severity_controls[severity],"hidden");    
    }
}

function toggle_log_control(log_type,clear){
    log_controls[log_type] = !log_controls[log_type];
    if(clear){  
    set_batch_visibility(`logging_type_${log_type}`,log_controls[log_type],"hidden2");
    }
}
function clear_logs(log_element_id){
    let log_element = document.getElementById(log_element_id);    
    log_element.innerHTML = '';
}
function subscribe_to_logs(log_name,log_type,log_element_id,filterable){
    let log_element = document.getElementById(log_element_id);
    //Max 3000 characters in console for each log type
    let max_chars = 10000;
    let max_message_len = 100;
    ["info","warning","error","debug"].forEach((log_severity) =>{
        socket.on(`logging_${log_severity}_${log_name}`,function(message){
            if(filterable){
                if(!log_controls[log_type]){
                    return;
                }
                if(!log_severity_controls[log_severity]){
                    return;
                }
            }
            if(message=="UISYSCMD::CLS"){
                //Clear logs
                message = "Awaiting new connection. <br>---------------------------------------------------------------------------------<br><br>";
            }
            if(message.length > max_message_len){
                message = message.slice(0,max_message_len) + "...";
            }
            log_element.innerHTML = `<label class="logging_${log_severity} logging_type_${log_type} ">|${log_name}| ${message}</label>` + log_element.innerHTML ;
            
            if(log_element.innerHTML.length > max_chars){
                log_element.innerHTML = log_element.innerHTML.slice(0,max_chars) + "...";
            }
        });
    });        
}
function get_current_target_value(){
    return parseFloat(document.getElementById("target_value_input").value);
}
function update_target_minmax_displays(){
    let target_minmax = parseFloat(document.getElementById("target_minmax_input").value);
    if((target_minmax!=0 && !target_minmax)){
        return;
    }
    if(target_minmax == 0){
        target_minmax = 0.1;
    }    
    target_minmax = Math.abs(target_minmax);    
    const current_target = get_current_target_value();
    document.getElementById("target_minmax_input").value = target_minmax;
    set_horizontal_slider_minmax(target_minmax);
    set_slider_minmax(target_minmax);
    if(current_target > target_minmax || current_target < -target_minmax){
        request_target_change(Math.max(-target_minmax,Math.min(target_minmax,current_target)));
    }    
}
function set_slider_minmax(target_minmax){
    slider_min = -target_minmax;
    slider_max = target_minmax;
    updateSliderAngle(
        remap_slider_val_to_angle_range(get_current_target_value())
    );
}
function set_target_minmax_value(minmax){
    document.getElementById("target_minmax_input").value = minmax;        
    update_target_minmax_displays();
}
function set_horizontal_slider_minmax(minmax){
    document.getElementById("horizontal_slider").min = -minmax;
    document.getElementById("horizontal_slider").max = minmax;
    document.getElementById("horizontal_slider").step = minmax/50;
    for(let i=1;i<10;i++){
        if(i < 6){
            document.getElementById(`horizontal_slider_label_${i}`).innerHTML = round_to_digit(((i-5)/4)*minmax,2);
        }else{
            document.getElementById(`horizontal_slider_label_${i}`).innerHTML = round_to_digit(((i-5)/4)*minmax,2);
        }
    }
}
function connect_com(device){    
    if(!device){
        return;
    }
    socket.emit("client_request_connect_com",
        {
            "port_name":device,
            "command_id":document.getElementById("commandIDInput").value,
            "serial_rate":document.getElementById("serialRateInput").value,
            "serial_byte_size":document.getElementById("byteSizeSelect").value,
            "serial_parity":document.getElementById("paritySelect").value,
            "stop_bits":document.getElementById("stopBitsSelect").value,
        }
    )
}
function disconnect_com(device){
    document.getElementById(`button_disconnect_com_${device}`).innerHTML = `
    <div class="lds-dual-ring-small"></div>      
        Pending...
    `;
    socket.emit("client_request_disconnect_com",
            {
                "port_name":device
            }
    )
}
function refresh_coms(){
    socket.emit("client_request_device_refresh",{});
}

function zero_sensor_offset(){    
    socket.emit("client_request_zero_sensor_offset",{
        "port_name":selected_device
    });
}
function set_control_torque_mode(control_torque_mode){
    socket.emit("client_request_control_torque_mode_change",{
        "port_name":selected_device,
        "control_torque_mode":control_torque_mode
    });
}
function set_control_mode(control_loop_mode){
    let colour = "";
    if(control_loop_mode ==0){
        colour = '#ffe066';
    }else if(control_loop_mode == 2 || control_loop_mode == 4){
        colour = '#ffa94d';
    }else if(control_loop_mode == 1 || control_loop_mode == 3){
        colour = '#63e6be';
    }
    document.getElementById("angle_slider2").style.backgroundColor = colour;
    socket.emit("client_request_control_mode_change",{
        "port_name":selected_device,
        "control_mode":control_loop_mode
    });
}
function configuration_file_select_open(){
    document.getElementById("configuration_file_select").click();
}
function request_target_change(value){
    value = Math.max(slider_min,Math.min(value,slider_max));
    update_target_display_value(value);
    socket.emit("client_request_target_change",{
        "port_name":selected_device,
        "target_value":value
    });
}
function handle_terminal_input(evt){
    if(evt.key == "Enter"){
        send_serial_input();
    }
}
function send_serial_input(){
    const raw = document.getElementById("terminal_input").value;    
    socket.emit(
        "client_request_serial_raw_input",
        {"port_name":selected_device,
         "raw":raw
        }
    )
    document.getElementById("terminal_input").value = "";
}
document.getElementById("target_value_input").oninput = (evt)=>{
    const val = parseFloat(evt.target.value);
    if(val || val==0){
        request_target_change(val);
    }
};
function zero_target(){    
    request_target_change(0);
}
function pull_configuration(){
    if(!selected_device){
        notifier.alert(`Pull configuration failed. No device connected.`);            
        setTimeout(() => notifier.closeToasts(), 5000);
        return;
    }
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
        status = 0;
    }else{
        status = 1;
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
        "request_status":!sending_live_data,
        "monitoring_variables":selected_monitoring_variables
    });
}
function update_monitoring_variables(index,checked){    
    selected_monitoring_variables[index] = checked;
    if(!selected_device){
        return;
    }
    socket.emit("client_request_change_monitoring_variables",{
        "port_name":selected_device,
        "monitoring_variables":selected_monitoring_variables
    });
}
function toggle_monitoring_variable(type){
    const checked = document.getElementById(`${type}_monitor_checkbox`).checked;
    document.getElementById(`${type}_monitor_checkbox`).checked = !checked;
    monitoring_variable_names.forEach((variable_name,index)=>{
        if(variable_name==type){
            update_monitoring_variables(index,!checked);
        }
    });
}
function open_save_configuration_modal(){
    save_configuration_modal.el.classList.remove("hidden");
}
function get_arduino_code(){
    code = "";
    code += "#include ...\n\n"
    code += "void setup(){\n\n"
    code += "....\n\n"
    code += "\n"
    
    code += "// control loop type and torque mode \n"
    code += "motor.torque_controller = TorqueControlType::"
    if(selected_torque_mode == 0){
        code += "voltage"
    }else if(selected_torque_mode == 1){
        code += "dc_current"
    }else if(selected_torque_mode == 2){
        code += "foc_current"
        code += ";\n"
        code += "motor.controller = MotionControlType::"
    }
    if(selected_control_mode == 0){
        code += "torque";
    }else if(selected_control_mode == 1){
        code += "velocity";
    }else if(selected_control_mode == 2){
        code += "angle"
    }else if(selected_control_mode == 3){
        code += "velocity_openloop"
    }else if(selected_control_mode == 4){
        code += "angle_openloop"
    }
    code += ";\n"
    code += "motor.motion_downsample = " + document.getElementById('motion_downsample').value +";\n" 
    code += "\n"
        
    code += "// velocity loop PID\n"  
    code += "motor.PID_velocity.P = " + document.getElementById('velocity_P_gain').value  +";\n"  
    code += "motor.PID_velocity.I = " + document.getElementById('velocity_I_gain').value +";\n"  
    code += "motor.PID_velocity.D = " + document.getElementById('velocity_D_gain').value +";\n"  
    code += "motor.PID_velocity.output_ramp = " + document.getElementById('velocity_output_ramp').value +";\n"  
    code += "motor.PID_velocity.limit = " + document.getElementById('velocity_output_limit').value +";\n"  
    code += "// Low pass filtering time constant \n"  
    code += "motor.LPF_velocity.Tf = " + document.getElementById('velocity_low_pass_filter').value+";\n"  

    code += "\n"

    code += "// angle loop PID\n"  
    code += "motor.P_angle.P = " + document.getElementById('position_P_gain').value  +";\n"  
    code += "motor.P_angle.I = " + document.getElementById('position_I_gain').value +";\n"  
    code += "motor.P_angle.D = " + document.getElementById('position_D_gain').value +";\n"  
    code += "motor.P_angle.output_ramp = " + document.getElementById('position_output_ramp').value +";\n"  
    code += "motor.P_angle.limit = " + document.getElementById('position_output_limit').value +";\n"  
    code += "// Low pass filtering time constant \n"  
    code += "motor.LPF_angle.Tf = " + document.getElementById('position_low_pass_filter').value+";\n"  
    
    code += "\n"

    code += "// current_q loop PID\n"  
    code += "motor.PID_current_q.P = " + document.getElementById('curr_q_P_gain').value  +";\n"  
    code += "motor.PID_current_q.I = " + document.getElementById('curr_q_I_gain').value +";\n"  
    code += "motor.PID_current_q.D = " + document.getElementById('curr_q_D_gain').value +";\n"  
    code += "motor.PID_current_q.output_ramp = " + document.getElementById('curr_q_output_ramp').value +";\n"  
    code += "motor.PID_current_q.limit = " + document.getElementById('curr_q_output_limit').value +";\n"  
    code += "// Low pass filtering time constant \n"  
    code += "motor.LPF_current_q.Tf = " + document.getElementById('curr_q_low_pass_filter').value+";\n"  

    code += "\n"

    code += "// current_d loop PID\n"  
    code += "motor.PID_current_d.P = " + document.getElementById('curr_d_P_gain').value  +";\n"  
    code += "motor.PID_current_d.I = " + document.getElementById('curr_d_I_gain').value +";\n"  
    code += "motor.PID_current_d.D = " + document.getElementById('curr_d_D_gain').value +";\n"  
    code += "motor.PID_current_d.output_ramp = " + document.getElementById('curr_d_output_ramp').value +";\n"  
    code += "motor.PID_current_d.limit = " + document.getElementById('curr_d_output_limit').value +";\n"  
    code += "// Low pass filtering time constant \n"  
    code += "motor.LPF_current_d.Tf = " + document.getElementById('curr_d_low_pass_filter').value+";\n"  
    
    code += "\n"

    code += "// Limits \n"
    code += "motor.velocity_limit = " + document.getElementById('velocity_limit').value +";\n" 
    code += "motor.voltage_limit = " + document.getElementById('voltage_limit').value +";\n" 
    code += "motor.current_limit = " + document.getElementById('current_limit').value +";\n" 

    /*code += "// sensor zero offset - home position \n"
    code += "motor.sensor_offset = " + "" +";\n" */

    /*code += "// sensor zero electrical angle \n"
    code += "// this parameter enables skipping a part of initFOC \n"
    code += "motor.sensor_electrical_offset = " + "" +";\n" */

    code += "\n"

    code += "// general settings \n"
    code += "// motor phase resistance \n"
    code += "motor.phase_resistance = " + document.getElementById('phase_resistance').value +";\n" 

    code += "\n"

    code += "// pwm modulation settings \n"
    code += "motor.foc_modulation = FOCModulationType::"
    const modulation_type_select = document.getElementById('modulation_type').value;
    if(modulation_type_select == 0){
        code += "SinePWM"
    }else if(modulation_type_select == 1){
        code += "SpaceVectorPWM"
    }else if(modulation_type_select == 2){
        code += "Trapezoid_120"
    }else if(modulation_type_select == 3){
        code += "Trapezoid_150"
    }
    code += ";\n"
    code += "motor.modulation_centered = " + document.getElementById('modulation_centered').value +";\n" 

    code += "\n\nmotor.init();\nmotor.initFOC();\n\n...\n\n }"
    code += "\n\nvoid loop() {\n\n....\n\n}"
    return code
}
function open_generate_code_modal(){
    new AWN().modal(
        `<div class='generate_code_modal' >
        <h3>Generated Arduino Code:</h3>
        <button class='button1' onclick="navigator.clipboard.writeText(get_arduino_code());">
        Copy To Clipboard
        </button>
        <pre style='overflow:scroll !important;height:350px !important'><code class="language-c++">${get_arduino_code()}</code></pre>
        </div>
        `,
    )
    hljs.highlightAll();
}
function setup_monitor_checkboxes(){
    ["target","volt_q","volt_d","curr_q","curr_d","velocity","angle"].forEach((variable,idx)=>{
        document.getElementById(`${variable}_monitor_checkbox`).onchange = (evt)=>{
            update_monitoring_variables(idx,evt.target.checked);
        };
    });
}
function initiate_connection(){
    set_main_loader(false);
    socket.emit("client_request_initiate_connection",{});
}
function readFileContent(file) {
	const reader = new FileReader()
  return new Promise((resolve, reject) => {
    reader.onload = event => resolve(event.target.result)
    reader.onerror = error => reject(error)
    reader.readAsText(file)
  })
}
document.getElementById("configuration_file_select").addEventListener('change', function(){
    const file = this.files[0];
    readFileContent(file).then(content => {
        try{
            const config_data = JSON.parse(content);
            let success = false;
            if(config_data["motor_parameters"]){
                for(let param_name in config_data["motor_parameters"]){
                    document.getElementById(param_name).value = config_data["motor_parameters"][param_name]
                };
                success = true;
            }
            if(success){
                notifier.success(`Success! Loaded from configuration file.`);
            }else{
                notifier.alert(`Incorrect JSON file format : ${file.name}`);            
            }
        }catch{
            notifier.alert(`Cannot parse uploaded file.${file.name}`);            
        }        
        setTimeout(() => notifier.closeToasts(), 5000);
    });
});

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
function switch_monitoring_variables_display(monitoring_variables){
    selected_monitoring_variables = monitoring_variables;
    monitoring_variables.forEach((status,variable_idx)=>{
        document.getElementById(`${monitoring_variable_names[variable_idx]}_monitor_checkbox`).checked = status;
    });
}
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

function reflect_log_status(){
    ["page_logs","console_logs"].forEach((log_type)=>{
        const ui_element_checked = document.getElementById(`log_control_${log_type}_checkbox`).checked;
        set_batch_visibility(
            `logging_type_${log_type}`,
            ui_element_checked,
            "hidden"
            );
        log_controls[log_type] = ui_element_checked;
    });
    
    ["info","warning","error","debug"].forEach((log_severity)=>{
        const ui_element_checked = document.getElementById(`log_control_${log_severity}_checkbox`).checked;
        set_batch_visibility(
            `logging_${log_severity}`,
            ui_element_checked,
            "hidden2"
            );
        log_severity_controls[log_severity] = ui_element_checked;
    });
}
function change_pid_type(type){
    ["position","velocity","curr_q","curr_d"].forEach((pid_type)=>{
        if(pid_type == type){
            document.getElementById(`pid_${pid_type}`).classList.remove("hidden");
        }else{
            document.getElementById(`pid_${pid_type}`).classList.add("hidden");
        }
    });
}
function get_motor_params_JSON(){
    const all_params = {};
    ["motion_downsample",
    "velocity_P_gain",
    "velocity_I_gain",
    "velocity_D_gain",
    "velocity_output_ramp",
    "velocity_output_limit",
    "velocity_low_pass_filter",
    "position_P_gain",
    "position_P_gain",
    "position_P_gain",
    "position_output_ramp",
    "position_output_limit",
    "position_low_pass_filter",
    "curr_d_P_gain",
    "curr_d_P_gain",
    "curr_d_P_gain",
    "curr_d_output_ramp",
    "curr_d_output_limit",
    "curr_d_low_pass_filter",
    "curr_q_P_gain",
    "curr_q_P_gain",
    "curr_q_P_gain",
    "curr_q_output_ramp",
    "curr_q_output_limit",
    "curr_q_low_pass_filter",
    "velocity_limit",
    "voltage_limit",
    "current_limit",
    "phase_resistance",
    "modulation_type",
    "modulation_centered"].forEach((param_name)=>{
        all_params[param_name] = document.getElementById(param_name).value
    })
    return all_params
}
function get_all_configurations_JSON(){
    return {
        "motor_parameters":get_motor_params_JSON()
    };
}
function push_configuration(){
    if(!selected_device){
        notifier.alert(`Push configuration failed. No device connected.`);            
        setTimeout(() => notifier.closeToasts(), 5000);
        return;
    }
    const all_configurations = get_all_configurations_JSON();
    socket.emit("client_request_push_configurations",{
        "port_name":selected_device,
        "config_data":all_configurations
    })
}
function save_configuration(file_name){
    if(!file_name){
        return;
    }
    const all_configurations = get_all_configurations_JSON();    
    socket.emit("client_request_save_configurations_to_file",{
        "config_data":all_configurations,
        "save_name":file_name
    })
}
function change_parameter_var(parameter_var_name,value){
    if(!selected_device){
        return;
    }
    socket.emit("client_request_change_parameter_var",{
        "port_name":selected_device,
        "parameter_var_name":parameter_var_name,
        "value":value
    })
}
function change_monitor_downsample(amount){
    if(!selected_device){
        return;
    }
    if(amount==0 || amount){
        amount = Math.min(Math.max(amount,0),5000);
        socket.emit("client_request_change_monitor_downsample",{
            "port_name":selected_device,
            "value":amount
        })
        document.getElementById("monitor_downsample").value = amount;
    }
}
function jogging_control(val){
    request_target_change(get_current_target_value()+val*slider_max);
};
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
window.addEventListener("resize", ()=>{
    make_clear_logs_button_right();    
});

function make_clear_logs_button_right(){
    const rect = document.getElementById("logs_message_box").getBoundingClientRect();
    document.getElementById("clear_logs_button").style = `width:${rect.width}px !important`;
}
function set_device_connected_status(connected){
    if(connected){
        document.getElementById("connection_button").classList.add("button_connected");
        document.getElementById("connection_button").innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-check-circle"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
        Connected`;
        document.getElementById("mask_panel").classList.add("hidden");
    }else{
        document.getElementById("connection_button").classList.remove("button_connected");
        document.getElementById("connection_button").innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-stop-circle"><circle cx="12" cy="12" r="10"></circle><rect x="9" y="9" width="6" height="6"></rect></svg>
        Connect
        `;
        selected_device = null;
        document.getElementById("mask_panel").classList.remove("hidden");
    }
}
function set_main_loader(val){
    if(val){
        document.getElementById("loading_bar").classList.remove("hidden");
    }else{
        document.getElementById("loading_bar").classList.add("hidden");
    }
    
}
function unselect_device(){    
    selected_device = null;
}



let  i= 0;
setInterval(()=>{
    i += 0.001; 
    const control_loop_mode = document.getElementById("control_loop_mode_select").value;
    let actual_key;
    //Reflect actual value and Error
    if(control_loop_mode ==0){
        actual_key = "volt_q";
    }else if(control_loop_mode == 2 || control_loop_mode == 4){
        actual_key = "angle";
    }else if(control_loop_mode == 1 || control_loop_mode == 3){
        actual_key = "velocity";
    }
    const actual_value = current_monitor_values[actual_key];
    const current_target = get_current_target_value();
    if(actual_value){
        document.getElementById("actual-value").innerHTML = round_to_digit(actual_value,2);
        if(current_target || current_target == 0){
            document.getElementById("error-value").innerHTML = round_to_digit(current_target - actual_value,2);  
        }else{
            document.getElementById("error-value").innerHTML = "-"  ;
        }
        updateSliderActualIndicatorAngle(remap_slider_val_to_angle_range(actual_value));
    }else{
        document.getElementById("actual-value").innerHTML = "-";
        document.getElementById("error-value").innerHTML = "-"; 
        updateSliderActualIndicatorAngle(remap_slider_val_to_angle_range(0));
    }
    
},10);

make_clear_logs_button_right();
setup_monitor_checkboxes();
reflect_log_status();
subscribe_to_logs("general","page_logs","logs_message_box",true);
subscribe_to_logs("device_page","page_logs","logs_message_box",true);
subscribe_to_logs("serial_connection","console_logs","logs_message_box",true);
subscribe_to_logs("serial_console","console_logs","logs_message_box",true);
subscribe_to_logs("serial_raw_input","serial_raw_input","terminal_console_messages",false);
update_target_display_value(0);
update_actual_target_value(0);
initiate_connection();
