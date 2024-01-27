from time import monotonic
import serial
from src.gui_new.utils import (
    to_serial_parity,
    to_serial_size,
    to_stop_bits,
    SERIAL_MONITOR_DATA_TYPE,
)
from src.gui_new.simpleFOCDevice import SimpleFOCDevice
from threading import Thread, Event
from serial.tools import list_ports


def simplefoc_device_command(log=True):
    def _inner(func):
        def wrapper(cls, *args, **kwargs):
            if cls.simple_foc_device is None:
                return
            ret, command = func(cls, *args, **kwargs)
            if ret:
                if log:
                    cls.server.log_debug("serial_console", f"Sent: {command}")
            else:
                cls.server.log_error("serial_console", f"Failed to Send: {command}")
        return wrapper
    return _inner


def simplefoc_device_command_multiple(log=True):
    def _inner(func):
        def wrapper(cls, *args, **kwargs):
            if cls.simple_foc_device is None:
                return
            for ret, command in func(cls, *args, **kwargs):
                if ret:
                    if log:
                        cls.server.log_debug("serial_console", f"Sent: {command}")
                else:
                    cls.server.log_error("serial_console", f"Failed to Send: {command}")
        return wrapper
    return _inner


class SimpleFOCSerialConnection:
    
    def __init__(self, server, port_name, command_id, serial_rate, serial_byte_size, serial_parity, stop_bits,state_update_callback):
        self.server = server
        self.simple_foc_device = None
        self.pulled_initial_params = False
        try:
            self.serial_connection = SerialConnection(
                port_name, serial_rate, serial_byte_size, serial_parity, stop_bits, data_read_callback=self.parse_serial_data_read
            )
            self.simple_foc_device = SimpleFOCDevice(self.serial_connection.serial_comm,command_id,state_update_callback)            
        except Exception as e:
            self.server.log_error("general", str(e))
            raise

        self.serial_monitor_buffer = []
        self.last_monitor_send = monotonic()
        self.monitor_send_frequency = 10

        self.server.log_debug("general", "Serial comm established.")
        self.parameter_variable_setters = {
            "phase_resistance":self.sendPhaseResistance,
            "current_limit":self.sendCurrentLimit,
            "velocity_limit":self.sendVelocityLimit,
            "voltage_limit":self.sendVoltageLimit,
            "motion_downsample":self.sendMotionDownsample,
            "modulation_type":self.sendModulationType,
            "modulation_centered":self.sendModulationCentered,
        }
        self.PID_param_setters = {
            "P_gain":self.sendProportionalGain,
            "I_gain":self.sendIntegralGain,
            "D_gain":self.sendDerivativeGain,
            "output_ramp":self.sendOutputRamp,
            "output_limit":self.sendOutputLimit,
        }
        self.LPF_param_setters = {            
            "low_pass_filter":self.sendLowPassFilter
        }
        self.PID_type_switch = {
            "position":self.simple_foc_device.PIDAngle,
            "velocity":self.simple_foc_device.PIDVelocity,
            "curr_d":self.simple_foc_device.PIDCurrentD,
            "curr_q":self.simple_foc_device.PIDCurrentQ
        }
        self.LPF_type_switch = {
            "position":self.simple_foc_device.LPFAngle,
            "velocity":self.simple_foc_device.LPFVelocity,
            "curr_d":self.simple_foc_device.LPFCurrentD,
            "curr_q":self.simple_foc_device.LPFCurrentQ
        }
    def sendRaw(self,raw):
        self.serial_connection.write(f"{raw}\n".encode("utf-8"))
        
    def is_PID_parameter(self,parameter_var_name):
        for val in self.PID_param_setters:
            if val in parameter_var_name:
                return val        
        return None
    def is_LPF_parameter(self,parameter_var_name):
        for val in self.LPF_param_setters:
            if val in parameter_var_name:
                return val
        return None

    def get_pid_type(self,type_name):
        return self.PID_type_switch[type_name]

    def get_lpf_type(self,type_name):
        return self.LPF_type_switch[type_name]
    
    def changeMotorParameterVariable(self,parameter_var_name,value):
        if parameter_var_name in self.parameter_variable_setters:            
            return self.parameter_variable_setters[parameter_var_name](value)
        else:
            parameter_type = self.is_PID_parameter(parameter_var_name)
            if parameter_type is not None:
                type_name = parameter_var_name.replace(f"_{parameter_type}","")
                pid_type = self.get_pid_type(type_name)
                return self.PID_param_setters[parameter_type](pid_type,value)
            
            parameter_type = self.is_LPF_parameter(parameter_var_name)
            if parameter_type is not None:
                type_name = parameter_var_name.replace(f"_{parameter_type}","")
                lpf_type = self.get_lpf_type(type_name)
                return self.LPF_param_setters[parameter_type](lpf_type,value)
    
    @simplefoc_device_command()
    def sendControlType(self, control_type):
        return self.simple_foc_device.sendControlType(control_type)

    @simplefoc_device_command()
    def sendTargetValue(self, target_value):
        return self.simple_foc_device.sendTargetValue(target_value)

    @simplefoc_device_command()
    def sendDeviceStatus(self, device_status):
        return self.simple_foc_device.sendDeviceStatus(device_status)

    @simplefoc_device_command()
    def sendMonitorVariables(self, monitoring_variables):
        return self.simple_foc_device.sendMonitorVariables(monitoring_variables)

    @simplefoc_device_command()
    def sendMotionDownsample(self, motion_downsample):
        return self.simple_foc_device.sendMotionDownsample(motion_downsample)

    @simplefoc_device_command()
    def sendProportionalGain(self,pid_type, value):
        return self.simple_foc_device.sendProportionalGain(pid_type,value)
    
    @simplefoc_device_command()
    def sendIntegralGain(self,pid_type, value):
        return self.simple_foc_device.sendIntegralGain(pid_type,value)
    
    @simplefoc_device_command()
    def sendDerivativeGain(self,pid_type, value):
        return self.simple_foc_device.sendDerivativeGain(pid_type,value)
    
    @simplefoc_device_command()
    def sendOutputRamp(self,pid_type, value):
        return self.simple_foc_device.sendOutputRamp(pid_type,value)

    @simplefoc_device_command()
    def sendOutputLimit(self,pid_type, value):
        return self.simple_foc_device.sendOutputLimit(pid_type,value)
    
    @simplefoc_device_command()
    def sendLowPassFilter(self,lpf_type, value):
        return self.simple_foc_device.sendLowPassFilter(lpf_type,value)
    
    @simplefoc_device_command()
    def sendVelocityLimit(self,value):
        return self.simple_foc_device.sendVelocityLimit(value)
    
    @simplefoc_device_command()
    def sendVoltageLimit(self,value):
        return self.simple_foc_device.sendVoltageLimit(value)

    @simplefoc_device_command()
    def sendCurrentLimit(self,value):
        return self.simple_foc_device.sendCurrentLimit(value)
    
    @simplefoc_device_command()
    def sendPhaseResistance(self,value):
        return self.simple_foc_device.sendPhaseResistance(value)
    
    @simplefoc_device_command()
    def sendSensorZeroElectrical(self):
        return self.simple_foc_device.sendSensorZeroElectrical()
    
    @simplefoc_device_command()
    def sendSensorZeroOffset(self):
        return self.simple_foc_device.sendSensorZeroOffset()
    
    @simplefoc_device_command()
    def sendModulationCentered(self,value):
        return self.simple_foc_device.sendModulationCentered(value)
    
    @simplefoc_device_command()
    def sendModulationType(self,type):
        return self.simple_foc_device.sendModulationType(type)

    
    @simplefoc_device_command_multiple()
    def pullConfiguration(self):
        for ret, command in self.simple_foc_device.pullConfiguration():
            yield ret, command

    def stop(self):
        self.simple_foc_device.stop()
        self.serial_connection.stop()

    @property
    def port_name(self):
        return self.serial_connection.port_name

    def parse_serial_data_read(self, data):
        if self.simple_foc_device is None:
            return
        if not self.pulled_initial_params:
            self.pullConfiguration()
            self.pulled_initial_params = True
        data_type, value = self.simple_foc_device.parse(data)
        if data_type == SERIAL_MONITOR_DATA_TYPE.MONITORING:
            # Throttle/Buffer a few serials at once before sending otherwise will flood            
            if monotonic() - self.last_monitor_send > 1 / self.monitor_send_frequency:
                self.last_monitor_send = monotonic()
                # self.server.log_info("serial_console",f"{monotonic()}::{self.serial_monitor_buffer}")
                self.serial_monitor_buffer = []
            else:
                self.serial_monitor_buffer.append(value)
        elif data_type == SERIAL_MONITOR_DATA_TYPE.STATES:
            self.server.log_debug("serial_console", f"{monotonic()}::{value}")
        elif data_type == SERIAL_MONITOR_DATA_TYPE.COMMAND:
            self.server.log_debug("serial_console", f"{monotonic()}::{value}")


class SerialConnection:
    """
    A specific connection to a particular serial device
    """

    def __init__(self, port_name, serial_rate, serial_byte_size, serial_parity, stop_bits,data_read_callback=lambda data:None):
        self._stop_event = Event()
        self.serial_comm = None
        self.serial_listening_thread = None

        self.port_name = port_name
        self.serial_rate = serial_rate
        self.serial_byte_size = serial_byte_size
        self.serial_parity = serial_parity
        self.stop_bits = stop_bits

        self.start_listening_to_comm(data_read_callback=data_read_callback)

    def stop(self):
        self._stop_event.set()
        if self.serial_listening_thread is not None:
            self.serial_listening_thread.join()
            self.serial_listening_thread = None
        if self.serial_comm is not None:
            self.serial_comm.close()
            self.serial_comm = None

    def start_listening_to_comm(
        self,
        data_read_callback=lambda data: None,
    ):
        self.serial_comm = serial.Serial(
            self.port_name,
            int(self.serial_rate),
            to_serial_size(self.serial_byte_size),
            to_serial_parity(self.serial_parity),
            to_stop_bits(self.stop_bits),
            timeout=0.25,
        )
        # Refresh event
        self._stop_event = Event()

        def _t():
            while not self._stop_event.is_set():
                if self.serial_comm.isOpen():
                    read = self.serial_comm.readline()
                    if read:
                        try:
                            data_read_callback(read.decode())
                        except UnicodeDecodeError:
                            # Missed bits?
                            pass

        self.serial_listening_thread = Thread(target=_t)
        self.serial_listening_thread.start()


class SerialInterface:
    """
    Discovers and creates connections to visible compatible
    serial devices
    """

    def __init__(self, server):
        self.server = server
        self.all_ports = self.get_available_ports()
        self.serial_connections = {}

    def get_serial(self, port_name):
        return self.serial_connections.get(port_name, None)

    def disconnect_all_serials(self):
        to_disconnect = list(self.serial_connections.keys())
        for (
            port_name
        ) in to_disconnect:  # Otherwise dictionary will change during iteration
            self.disconnect_serial(port_name)

    def disconnect_serial(self, port_name):
        if self.serial_connections.get(port_name, None) is not None:
            connection = self.serial_connections[port_name]
            connection.stop()
            del self.serial_connections[port_name]

    def connect_to_serial(self, port_name, command_id, serial_rate, serial_byte_size, serial_parity, stop_bits,state_update_callback=None):
        if port_name is None:
            self.server.log_error("serial_connection", "Connection Port Name is None!")
            return
        else:            
            serial_connection = self.serial_connections.get(port_name, None)
            if serial_connection is not None:
                self.server.log_debug(
                    "general", "Connection already established, joining in."
                )
            else:
                self.server.log_debug(
                    "general", "New connection established."
                )
                serial_connection = SimpleFOCSerialConnection(
                    self.server, port_name, command_id, serial_rate, serial_byte_size, serial_parity, stop_bits,state_update_callback
                )
                self.serial_connections[port_name] = serial_connection
            return serial_connection

    def get_available_ports(self):
        portNames = []
        for port in list_ports.comports():
            if port[2] != "n/a":
                portNames.append(port[0])
        return portNames
