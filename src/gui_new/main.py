from flask import Flask, render_template
from flask_socketio import SocketIO
import uuid
import atexit
from threading import Event, Thread
from time import sleep
import traceback
from src.gui_new.utils import LOG_SEVERITY,DEFAULT_PARAMS
from src.gui_new.simpleFOCSerialConnection import (
    SerialInterface,
    SimpleFOCSerialConnection,
)
from src.gui_new.simpleFOCDevice import SimpleFOCDevice


class FlaskServerWithSocketIO:
    def __init__(self):
        self.app = Flask(__name__)
        self.app.config["SECRET_KEY"] = "secret!"
        self.socketio = SocketIO(self.app)

        self.serve_index_page()

    def broadcast(self, channel, message):
        self.socketio.emit(channel, message)

    def serve_html(self, url, html_file_path, view_func=None):
        def index():
            if view_func is not None:
                view_func()
            return render_template(html_file_path)

        index.__name__ = str(uuid.uuid4())  # Hacky hack
        self.app.add_url_rule(url, view_func=index, methods=["GET"])

    def serve_index_page(self):
        self.serve_html("/", "index.html")

    def log(self, log_name, log_message, severity):
        if severity == LOG_SEVERITY.ERROR:
            # Also print stacktrace if error
            traceback.print_exc()
        self.broadcast(f"logging_{severity}_{log_name}", log_message)

    def log_info(self, channel, *log_messages):
        self.log(channel, " ".join(list(map(lambda x:str(x),log_messages))), severity=LOG_SEVERITY.INFO)

    def log_warning(self, channel, *log_messages):
        self.log(channel, " ".join(list(map(lambda x:str(x),log_messages))), severity=LOG_SEVERITY.WARNING)

    def log_error(self, channel, *log_messages):
        self.log(channel, " ".join(list(map(lambda x:str(x),log_messages))), severity=LOG_SEVERITY.ERROR)

    def log_debug(self, channel, *log_messages):
        self.log(channel, " ".join(list(map(lambda x:str(x),log_messages))), severity=LOG_SEVERITY.DEBUG)

    def start(self):
        self.socketio.run(self.app, host="0.0.0.0", debug=True)


class DevicePageSyncLiveData:
    def __init__(
        self, server: FlaskServerWithSocketIO, serial_connection, send_frequency=200
    ):
        self.server = server
        self.serial_connection = serial_connection
        self._stopped = Event()
        self.sync_device_live_data_thread = None

        def sync_listen_thread():
            while not self._stopped.is_set():
                self.server.socketio.emit(
                    "server_response_live_data",
                    self.serial_connection.simple_foc_device.serialize_live_data_data(),
                )
                sleep(1 / send_frequency)

        self.sync_device_live_data_thread = Thread(target=sync_listen_thread)
        self.sync_device_live_data_thread.start()

    def stop(self):
        self._stopped.set()
        if self.sync_device_live_data_thread is not None:
            self.sync_device_live_data_thread.join()
            self.sync_device_live_data_thread = None

def socketio_event_handler(requires_serial_connection=False):    
    def inner_handler(func):
        if requires_serial_connection:
            def outer_wrapper(cls,data):
                def inner_wrapper(cls, port_name=None, **kwargs):
                    if port_name is None:
                        cls.server.log_warning(
                            "general",
                            "Requesting serial connection but port not specified."
                        )
                        return
                    serial_connection: SimpleFOCSerialConnection = (
                        cls.serial_interface.get_serial(port_name)
                    )
                    if serial_connection is not None:
                        return func(cls,serial_connection, **kwargs)
                    else:
                        cls.server.log_warning(
                            "general",
                            "Requesting serial connection but serial connection not found!"
                        )
                        return None
                return inner_wrapper(cls,**data)
            return outer_wrapper
        else:
            def wrapper(cls, data):
                return func(cls, **data)
            return wrapper
    return inner_handler

class DevicePage:

    def __init__(
        self, server: FlaskServerWithSocketIO, serial_interface: SerialInterface
    ):
        self.server = server
        self.connected_com = None
        self.serial_live_data_sync = None
        self.serial_interface = serial_interface

        self.serve_devices_page()

        self.server.socketio.on_event(
            "client_request_device_refresh", self.refresh_devices
        )
        self.server.socketio.on_event("client_request_connect_com", self.connect_com)
        self.server.socketio.on_event(
            "client_request_disconnect_com", self.disconnect_com
        )
        self.server.socketio.on_event(
            "client_request_control_mode_change", self.change_control_mode
        )
        self.server.socketio.on_event(
            "client_request_target_change", self.change_target
        )
        self.server.socketio.on_event(
            "client_request_pull_configuration", self.pull_configuration
        )
        self.server.socketio.on_event(
            "client_request_set_device_status", self.set_device_status
        )
        self.server.socketio.on_event(
            "client_request_send_live_data_data", self.request_send_live_data
        )
        self.server.socketio.on_event(
            "client_request_change_monitoring_variables",
            self.request_change_monitoring_variables,
        )
        self.server.socketio.on_event(
            "client_request_initiate_connection", self.initiate_client_connection
        )
        self.server.socketio.on_event(
            "client_request_change_parameter_var",
            self.request_change_parameter_var
        )
        self.server.socketio.on_event(
            "client_request_change_monitor_downsample",
            self.request_change_monitor_downsample
        )
        self.server.socketio.on_event(
            "client_request_serial_raw_input",
            self.request_serial_raw_input()
        )

    def serve_devices_page(self):
        self.server.serve_html("/devices", "devices.html")    

    @socketio_event_handler(requires_serial_connection=True)
    def request_change_monitor_downsample(self,
        serial_connection: SimpleFOCSerialConnection, raw
    ):
        try:
            serial_connection.sendRaw(raw)
            self.server.log_info("serial_raw_input",raw)
        except Exception:
            self.server.log_error("serial_raw_input","Failed to send:",raw)

    @socketio_event_handler(requires_serial_connection=True)
    def request_change_monitor_downsample(self,
        serial_connection: SimpleFOCSerialConnection, value
    ):
        serial_connection.simple_foc_device.sendMonitorDownsample(value)

    @socketio_event_handler(requires_serial_connection=True)
    def request_change_parameter_var(self,
        serial_connection: SimpleFOCSerialConnection, parameter_var_name,value
    ):
        serial_connection.changeMotorParameterVariable(parameter_var_name,value)
        self.server.socketio.emit(
            "server_response_parameter_var_changed", {
                "parameter_var_name":parameter_var_name,
                "value":value
            }
        )

    @socketio_event_handler(requires_serial_connection=True)
    def request_change_monitoring_variables(
        self, serial_connection: SimpleFOCSerialConnection, monitoring_variables
    ):
        serial_connection.sendMonitorVariables(monitoring_variables)
        self.server.socketio.emit(
            "server_response_monitoring_variables_changed", monitoring_variables
        )

    @socketio_event_handler(requires_serial_connection=True)
    def pull_configuration(self, serial_connection: SimpleFOCSerialConnection):
        serial_connection.pullConfiguration()
        self.server.socketio.emit(
            "server_response_device_params_sync",
            serial_connection.simple_foc_device.serialize_simple()
        )

    @socketio_event_handler(requires_serial_connection=True)
    def set_device_status(
        self, serial_connection: SimpleFOCSerialConnection, device_status
    ):
        serial_connection.sendDeviceStatus(device_status)
        self.server.socketio.emit("server_response_device_status_change", device_status)
        self.server.log_debug("general","Device Status Changed.",device_status)

    @socketio_event_handler(requires_serial_connection=True)
    def change_target(self, serial_connection: SimpleFOCSerialConnection, target_value):
        serial_connection.sendTargetValue(target_value)
        self.server.socketio.emit("server_response_target_change", target_value)        

    @socketio_event_handler(requires_serial_connection=True)
    def change_control_mode(
        self, serial_connection: SimpleFOCSerialConnection, control_mode
    ):
        serial_connection.sendControlType(control_mode)
        self.server.socketio.emit("server_response_control_mode_change", control_mode)
        self.server.log_debug("general","Control Mode Changed.",control_mode)

    @socketio_event_handler(requires_serial_connection=True)
    def request_send_live_data(self, serial_connection:SimpleFOCSerialConnection,request_status:bool):
        if self.serial_live_data_sync is None:
            if request_status == True:
                self.serial_live_data_sync = DevicePageSyncLiveData(
                    self.server, serial_connection
                )
        else:
            if request_status != True:
                self.serial_live_data_sync.stop()
                self.serial_live_data_sync = None        
        self.server.socketio.emit("server_response_live_data_change",request_status)
        self.server.log_debug("general","Live data sending changed::Sending:",request_status)

    @socketio_event_handler()
    def initiate_client_connection(self):
        """
        Resync state information, for instance, current selected Device, etc...
        """
        self.refresh_devices({})
        if self.connected_com is not None:
            connected_port_name = self.connected_com.port_name
            monitor_variables = self.connected_com.simple_foc_device.monitorVariables
            device_params = self.connected_com.simple_foc_device.serialize_simple()
        else:
            connected_port_name = None
            monitor_variables = [False for _ in range(7)]
            device_params = DEFAULT_PARAMS

        self.server.socketio.emit("server_response_initialization",{
            "connected_port_name":connected_port_name,
            "live_data_syncing":self.serial_live_data_sync is not None,
            "monitoring_ariables":monitor_variables,
            "device_params":device_params

        })
    
    @socketio_event_handler()
    def refresh_devices(self):
        self.server.log_info("device_page", "Device Refreshed.")
        self.server.socketio.emit(
            "server_response_device_refresh",
            self.serial_interface.get_available_ports(),
        )

    @socketio_event_handler()
    def connect_com(
        self, port_name, command_id, serial_rate, serial_byte_size, serial_parity, stop_bits
    ):  
        if(self.connected_com is not None and port_name != self.connected_com.port_name):
            self.disconnect_com({"port_name":self.connected_com.port_name})

        def device_state_update_callback(simple_foc_device:SimpleFOCDevice):            
            self.server.socketio.emit(
                "server_response_device_params_sync",
                simple_foc_device.serialize_simple()
            )
            
        serial_connection = self.serial_interface.connect_to_serial(
            port_name, command_id, serial_rate, serial_byte_size, serial_parity, stop_bits,
            state_update_callback=device_state_update_callback
        )
        if serial_connection is not None:
            port_name = serial_connection.port_name
            self.connected_com = serial_connection
            self.server.socketio.emit("server_response_device_connect", {
                "port_name": port_name,
                "device_params":serial_connection.simple_foc_device.serialize_simple()
            })
            self.server.log_info("device_page", f"{port_name} Connected.")
        else:
            self.server.log_error("device_page", "Failed to connect to device!")        

    
    @socketio_event_handler()
    def disconnect_com(self, port_name):        
        ret = self.serial_interface.disconnect_serial(port_name)                
        self.connected_com = None
        self.server.socketio.emit("server_response_device_disconnect", port_name)
        self.server.log_info("device_page", f"{port_name} Disconnected.")
        self.server.log_info("device_page","UISYSCMD::CLS")

    def stop(self):
        if self.serial_live_data_sync is not None:
            self.serial_live_data_sync.stop()
        self.serial_interface.disconnect_all_serials()


def run_webui():
    server = FlaskServerWithSocketIO()
    serial_interface = SerialInterface(server=server)

    device_page = DevicePage(server=server, serial_interface=serial_interface)

    def on_server_stop():
        device_page.stop()

    # Register the callback function to be executed on server stop
    atexit.register(on_server_stop)

    server.start()
