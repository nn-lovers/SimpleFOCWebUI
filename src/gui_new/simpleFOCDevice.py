from src.gui_new.utils import SERIAL_MONITOR_DATA_TYPE
import time
from threading import Thread, Event
import traceback
import serial

class PIDController:
    P = 0
    D = 0
    I = 0
    outputRamp = 0
    outputLimit = 0
    cmd = ""

    def __init__(self, cmd):
        self.cmd = cmd

    def load(self, jsonValues):
        self.P = jsonValues["P"]
        self.I = jsonValues["I"]
        self.D = jsonValues["D"]
        self.outputRamp = jsonValues["outputRamp"]
        self.outputLimit = jsonValues["outputLimit"]

    def serialize(self):
        return {
            "P": self.P,
            "I": self.I,
            "D": self.D,
            "outputRamp": self.outputRamp,
            "outputLimit": self.outputLimit,
        }


class LowPassFilter:
    Tf = 0
    cmd = ""
    cmdTf = "F"

    def __init__(self, cmd):
        self.cmd = cmd


class Command:
    cmdName = ""
    cmd = ""

    def __init__(self, cmdname="Command", cmd=""):
        self.cmdName = cmdname
        self.cmd = cmd

    def load(self, jsonValues):
        self.cmdName = jsonValues["commandName"]
        self.cmd = jsonValues["commandValue"]

    def serialize(self):
        return {"commandName": self.cmdName, "commandValue": self.cmd}


class SimpleFOCDevice:
    TORQUE_CONTROL = 0
    VELOCITY_CONTROL = 1
    ANGLE_CONTROL = 2
    VELOCITY_OPENLOOP_CONTROL = 3
    ANGLE_OPENLOOP_CONTROL = 4

    SINE_PWM = 0
    SPACE_VECTOR_PWM = 1
    TRAPEZOIDAL_120 = 2
    TRAPEZOIDAL_150 = 3

    VOLTAGE_TORQUE = 0
    DC_CURRENT_TORQUE = 1
    FOC_CURRENT_TORQUE = 2

    VELOCITY_PID = "V"
    ANGLE_PID = "A"
    CURRENT_Q_PID = "Q"
    CURRENT_D_PID = "D"

    PULL_CONFIG_ON_CONNECT = "Pull config"
    PUSH_CONFG_ON_CONNECT = "Push config"
    ONLY_CONNECT = "Only connect"

    MONITORING_VARIABLE_KEYS = [
        "target",
        "volt_q",
        "volt_d",
        "curr_q",
        "curr_d",
        "velocity",
        "angle",
    ]

    def __init__(self, serial_comm, command_id="M",state_update_callback=None):
        self.update_states_thread = None
        self._stopped = Event()
        # serial connection variables
        self.serial_comm = serial_comm
        self.isConnected = True

        self.connectionStateListenerList = []
        self.connectionID = ""

        # command id of the device
        self.devCommandID = command_id

        # motion control paramters
        self.PIDVelocity = PIDController(self.VELOCITY_PID)
        self.PIDAngle = PIDController(self.ANGLE_PID)
        self.PIDCurrentQ = PIDController(self.CURRENT_Q_PID)
        self.PIDCurrentD = PIDController(self.CURRENT_D_PID)
        self.LPFVelocity = LowPassFilter(self.VELOCITY_PID)
        self.LPFAngle = LowPassFilter(self.ANGLE_PID)
        self.LPFCurrentQ = LowPassFilter(self.CURRENT_Q_PID)
        self.LPFCurrentD = LowPassFilter(self.CURRENT_D_PID)
        self.velocityLimit = 50
        self.voltageLimit = 10
        self.currentLimit = 1.5
        self.controlType = SimpleFOCDevice.ANGLE_CONTROL
        self.torqueType = SimpleFOCDevice.VOLTAGE_TORQUE
        self.initialTarget = 0
        self.motionDownsample = 0

        # monitor variables
        self.monitorDownsample = 0
        self.monitorVariables = [False for _ in range(7)]

        # state variables
        self.state_variables = {
            "target": 0,
            "angle": 0,
            "velocity": 0,
            "volt_q": 0,
            "volt_d": 0,
            "curr_q": 0,
            "curr_d": 0,
        }
        self.target = 0

        # general variables
        self.phaseResistance = 8
        self.deviceStatus = 1
        self.modulationType = 0
        self.modulationCentered = 1

        # sensor variables
        self.sensorElectricalZero = 0
        self.sensorZeroOffset = 0        
            
        self.start_update_states_thread(state_update_callback)

    def pullAllConfiguration(self):
        for ret, command in self.pullConfiguration():
            pass

    def start_update_states_thread(self,state_update_callback):
        self._stopped = Event()
        def _t():
            while not self._stopped.is_set():
                time.sleep(1)
                continue
                #self.updateStates()
                #if state_update_callback is not None:
                #    state_update_callback(self)
                #time.sleep(3)

        self.update_states_thread = Thread(target=_t)
        self.update_states_thread.start()

    def stop(self):
        self._stopped.set()
        if self.update_states_thread is not None:
            self.update_states_thread.join()
            self.update_states_thread = None

    def serialize_simple(self):
        return {
            "phase_resistance":self.phaseResistance,
            "current_limit":self.currentLimit,
            "velocity_limit":self.velocityLimit,
            "voltage_limit":self.voltageLimit,
            "motion_downsample":self.motionDownsample,
            "modulation_type":self.modulationType,
            "modulation_centered":self.modulationCentered,

            #Position
            "position_P_gain":self.PIDAngle.P,
            "position_I_gain":self.PIDAngle.I,
            "position_D_gain":self.PIDAngle.D,
            "position_output_ramp":self.PIDAngle.outputRamp,
            "position_output_limit":self.PIDAngle.outputLimit,

            #Velocity
            "velocity_P_gain":self.PIDVelocity.P,
            "velocity_I_gain":self.PIDVelocity.I,
            "velocity_D_gain":self.PIDVelocity.D,
            "velocity_output_ramp":self.PIDVelocity.outputRamp,
            "velocity_output_limit":self.PIDVelocity.outputLimit,

            #Current D
            "curr_d_P_gain":self.PIDCurrentD.P,
            "curr_d_I_gain":self.PIDCurrentD.I,
            "curr_d_D_gain":self.PIDCurrentD.D,
            "curr_d_output_ramp":self.PIDCurrentD.outputRamp,
            "curr_d_output_limit":self.PIDCurrentD.outputLimit,

            #Current Q
            "curr_q_P_gain":self.PIDCurrentQ.P,
            "curr_q_I_gain":self.PIDCurrentQ.I,
            "curr_q_D_gain":self.PIDCurrentQ.D,
            "curr_q_output_ramp":self.PIDCurrentQ.outputRamp,
            "curr_q_output_limit":self.PIDCurrentQ.outputLimit,
        }
    

    def toJSON(self):
        valuesToSave = {
            "PIDVelocity": self.PIDVelocity.serialize(),
            "PIDAngle": self.PIDAngle.serialize(),
            "PIDCurrentD": self.PIDCurrentD.serialize(),
            "PIDCurrentQ": self.PIDCurrentQ.serialize(),
            "LPFVelocity": self.LPFVelocity.Tf,
            "LPFAngle": self.LPFAngle.Tf,
            "LPFCurrentD": self.LPFCurrentD.Tf,
            "LPFCurrentQ": self.LPFCurrentQ.Tf,
            "velocityLimit": self.velocityLimit,
            "voltageLimit": self.voltageLimit,
            "currentLimit": self.currentLimit,
            "controlType": self.controlType,
            "motionDownsample": self.motionDownsample,
            "torqueType": self.torqueType,
            "phaseResistance": self.phaseResistance,
            "sensorZeroOffset": self.sensorZeroOffset,
            "sensorElectricalZero": self.sensorElectricalZero,
            "initialTarget": self.initialTarget,
            "connectionID": self.connectionID,
            "devCommandID": self.devCommandID,
        }
        return valuesToSave

    def parse(self, data):
        data = data.rstrip()
        if self.isDataReceivedMonitoring(data):
            v = data.split("\t")
            self.parseLiveDataMonitoring(v)
            return SERIAL_MONITOR_DATA_TYPE.MONITORING, v
        elif self.isDataReceivedStates(data):
            self.parseStateResponses(data)
            return SERIAL_MONITOR_DATA_TYPE.STATES, data
        else:
            self.parseResponses(data)
            return SERIAL_MONITOR_DATA_TYPE.COMMAND, data

    def isDataReceivedMonitoring(self, data):
        try:
            if data[0].isdigit() or data[0] == "-":
                return True
            else:
                return False
        except IndexError:
            return False

    def isDataReceivedStates(self, data):
        if "Monitor" in data:
            return True
        else:
            return False

    def sendCommand(self, command):
        encoded_command = (str(command) + "\n").encode("utf-8")
        try:
            self.serial_comm.write(encoded_command)
            return True  # Success
        except serial.PortNotOpenError:
            pass
        except Exception:
            traceback.print_exc()
            return False

    def setCommand(self, command, value):
        command = str(self.devCommandID) + str(command) + str(value)
        ret = self.sendCommand(command)
        return ret, command

    def getCommand(self, command):
        if self.isConnected:
            self.sendCommand(str(self.devCommandID) + str(command))

    def sendControlType(self, loop_control_type):
        if loop_control_type != "":
            self.controlType = loop_control_type
        return self.setCommand("C", str(loop_control_type))

    def sendTorqueType(self, torque_type):
        if torque_type != "":
            self.torqueType = torque_type
        return self.setCommand("T", str(torque_type))

    def sendMotionDownsample(self, value):
        if value != "":
            self.motionDownsample = value
        return self.setCommand("CD", str(value))

    def sendProportionalGain(self, pid, value):
        if value != "":
            pid.P = value
        return self.setCommand(str(pid.cmd) + "P", str(value))
        
    def sendIntegralGain(self, pid, value):
        if value != "":
            pid.I = value
        return self.setCommand(str(pid.cmd) + "I", str(value))

    def sendDerivativeGain(self, pid, value):
        if value != "":
            pid.D = value
        return self.setCommand(str(pid.cmd) + "D", str(value))

    def sendOutputRamp(self, pid, value):
        if value != "":
            pid.outputRamp = value
        return self.setCommand(str(pid.cmd) + "R", str(value))

    def sendOutputLimit(self, pid, value):
        if value != "":
            pid.outputLimit = value
        return self.setCommand(str(pid.cmd) + "L", str(value))

    def sendLowPassFilter(self, lpf, value):
        if value != "":
            lpf.Tf = value
        return self.setCommand(str(lpf.cmd) + "F", str(value))

    def sendVelocityLimit(self, value):
        if value != "":
            self.velocityLimit = value
        return self.setCommand("LV", str(value))

    def sendVoltageLimit(self, value):
        if value != "":
            self.voltageLimit = value
        return self.setCommand("LU", str(value))

    def sendCurrentLimit(self, value):
        if value != "":
            self.currentLimit = value
        return self.setCommand("LC", str(value))

    def sendPhaseResistance(self, value):
        if value != "":
            self.phaseResistance = value
        return self.setCommand("R", str(value))

    def sendTargetValue(self, targetvalue):
        if targetvalue != "":
            self.target = targetvalue
        return self.setCommand("", self.target)

    def sendSensorZeroOffsetFromCurrentAngle(self):     
        #TODO: ???
        return self.sendSensorZeroOffset(float(self.state_variables["angle"]))

    def sendSensorZeroOffset(self, targetvalue):
        if targetvalue != "":
            self.sensorZeroOffset = targetvalue
        return self.setCommand("SM", str(targetvalue))

    def sendSensorZeroElectrical(self, targetvalue):
        if targetvalue != "":
            self.sensorElectricalZero = targetvalue
        return self.setCommand("SE", str(targetvalue))

    def sendModulationCentered(self, targetvalue):
        if targetvalue != "":
            self.modulationCentered = targetvalue
        return self.setCommand("WC", str(targetvalue))

    def sendModulationType(self, targetvalue):
        if targetvalue != "":
            self.modulationType = targetvalue
        return self.setCommand("WT", str(targetvalue))

    def sendDeviceStatus(self, targetvalue):
        if targetvalue != "":
            self.deviceStatus = targetvalue
        return self.setCommand("E", str(targetvalue))

    def sendMonitorDownsample(self, targetvalue):
        if targetvalue != "":
            self.monitorDownsample = targetvalue
        return self.setCommand("MD", str(targetvalue))

    def sendMonitorClearVariables(self):
        self.monitorVariables = [False for _ in range(7)]
        self.getCommand("MC")

    def sendMonitorVariables(self, vararray):
        if vararray != "":
            val = 0
            m = 10**6
            for var in vararray:
                val = val + int(var) * m
                m = m / 10
            self.monitorVariables = vararray
            return self.setCommand("MS", "{:07d}".format(int(val)))
        else:
            self.getCommand("MS")
            return True, ""
    
    def updateStates(self):
        if self.isConnected:
            self.getCommand("MG0")
            time.sleep(100 / 1000)
            self.getCommand("MG1")
            time.sleep(100 / 1000)
            self.getCommand("MG2")
            time.sleep(100 / 1000)
            self.getCommand("MG3")
            time.sleep(100 / 1000)
            self.getCommand("MG4")
            time.sleep(100 / 1000)
            self.getCommand("MG5")
            time.sleep(100 / 1000)
            self.getCommand("MG6")
            time.sleep(100 / 1000)

    def pushConfiguration(self):
        self.sendControlType(self.controlType)
        """
        self.sendProportionalGain(self.PIDVelocity, self.proprotionalGainPID)
        self.sendIntegralGain(self.PIDVelocity, self.integralGainPID)
        self.sendDerivativeGain(self.PIDVelocity, self.derivativeGainPID)
        self.sendOutputRamp(self.PIDVelocity, self.voltageRampPID)
        self.sendLowPassFilter(self.LPFVelocity,self.lowPassFilter)
        #self.sendPGain(self.anglePGain)
        """
        self.sendVelocityLimit(self.velocityLimit)
        self.sendVoltageLimit(self.voltageLimit)
        self.sendTargetValue(self.initialTarget)

    def pullPIDConf(self, pid, lpf):
        yield self.sendProportionalGain(pid, "")
        time.sleep(5 / 1000)
        yield self.sendIntegralGain(pid, "")
        time.sleep(5 / 1000)
        yield self.sendDerivativeGain(pid, "")
        time.sleep(5 / 1000)
        yield self.sendOutputRamp(pid, "")
        time.sleep(5 / 1000)
        yield self.sendOutputLimit(pid, "")
        time.sleep(5 / 1000)
        yield self.sendLowPassFilter(lpf, "")

    def pullConfiguration(self):
        time.sleep(5 / 1000)
        yield self.sendControlType("")
        time.sleep(5 / 1000)
        yield self.sendTorqueType("")
        time.sleep(5 / 1000)
        for ret, command in self.pullPIDConf(self.PIDVelocity, self.LPFVelocity):
            yield ret, command
        time.sleep(5 / 1000)
        for ret, command in self.pullPIDConf(self.PIDAngle, self.LPFAngle):
            yield ret, command
        time.sleep(5 / 1000)
        for ret, command in self.pullPIDConf(self.PIDCurrentD, self.LPFCurrentD):
            yield ret, command
        time.sleep(5 / 1000)
        for ret, command in self.pullPIDConf(self.PIDCurrentQ, self.LPFCurrentQ):
            yield ret, command
        time.sleep(5 / 1000)
        yield self.sendVelocityLimit("")
        time.sleep(5 / 1000)
        yield self.sendVoltageLimit("")
        time.sleep(5 / 1000)
        yield self.sendCurrentLimit("")
        time.sleep(5 / 1000)
        yield self.sendSensorZeroElectrical("")
        time.sleep(5 / 1000)
        yield self.sendSensorZeroOffset("")
        time.sleep(5 / 1000)
        yield self.sendMotionDownsample("")
        time.sleep(5 / 1000)
        yield self.sendPhaseResistance("")
        time.sleep(5 / 1000)
        yield self.sendModulationCentered("")
        time.sleep(5 / 1000)
        yield self.sendModulationCentered("")
        time.sleep(5 / 1000)
        yield self.sendDeviceStatus("")
        return True, "---Pull Configuration---"

    def parsePIDFResponse(self, pid, lpf, commandResponse):
        if "P" in commandResponse:
            pid.P = float(commandResponse.replace("P: ", ""))
        if "I" in commandResponse:
            pid.I = float(commandResponse.replace("I: ", ""))
        if "D" in commandResponse:
            pid.D = float(commandResponse.replace("D: ", ""))
        if "ramp" in commandResponse:
            val = commandResponse.replace("ramp:", "")
            if "ovf" in val:
                pid.outputRamp = 0
            else:
                pid.outputRamp = float(commandResponse.replace("ramp:", ""))
        if "limit" in commandResponse:
            pid.outputLimit = float(commandResponse.replace("limit:", ""))
        if "Tf" in commandResponse:
            lpf.Tf = float(commandResponse.replace("Tf: ", ""))

    def parseLimitsResponse(self, commandResponse):
        if "vel:" in commandResponse:
            self.velocityLimit = float(commandResponse.replace("vel:", ""))
        elif "volt:" in commandResponse:
            self.voltageLimit = float(commandResponse.replace("volt:", ""))
        elif "curr:" in commandResponse:
            self.currentLimit = float(commandResponse.replace("curr:", ""))

    def parseMotionResponse(self, commandResponse):
        if "downsample" in commandResponse:
            self.motionDownsample = float(commandResponse.replace("downsample:", ""))
        elif "torque" in commandResponse:
            self.controlType = 0
        elif "angle open" in commandResponse:
            self.controlType = 4
        elif "angle" in commandResponse:
            self.controlType = 2
        elif "vel open" in commandResponse:
            self.controlType = 3
        elif "vel" in commandResponse:
            self.controlType = 1

    def parsePWMModResponse(self, commandResponse):
        if "center" in commandResponse:
            self.modulationCentered = float(commandResponse.replace("center:", ""))
        elif "type" in commandResponse:
            commandResponse = commandResponse.replace("type:", "")
            if "Sine" in commandResponse:
                self.modulationType = self.SINE_PWM
            elif "SVPWM" in commandResponse:
                self.modulationType = self.SPACE_VECTOR_PWM
            elif "Trap 120" in commandResponse:
                self.modulationType = self.TRAPEZOIDAL_120
            elif "Trap 150" in commandResponse:
                self.modulationType = self.TRAPEZOIDAL_150

    def parseTorqueResponse(self, commandResponse):
        if "volt" in commandResponse:
            self.torqueType = 0
        elif "dc curr" in commandResponse:
            self.torqueType = 1
        elif "foc curr" in commandResponse:
            self.torqueType = 2

    def parseSensorResponse(self, commandResponse):
        if "el. offset" in commandResponse:
            self.sensorElectricalZero = float(commandResponse.replace("el. offset:", ""))
        elif "offset" in commandResponse:
            self.sensorZeroOffset = float(commandResponse.replace("offset:", ""))

    def parseLiveDataMonitoring(self, data):
        # Sent in order of enabling
        matched = []
        parsed_indx = 0
        for item_indx, var in enumerate(self.monitorVariables):
            if var == True:
                matched.append((item_indx, parsed_indx))
                parsed_indx += 1
        # Some times we have a race condition
        if len(matched) != len(data):
            return
        else:
            for item_indx, parsed_indx in matched:
                self.state_variables[self.MONITORING_VARIABLE_KEYS[item_indx]] = data[
                    parsed_indx
                ]

    def serialize_live_data_data(self):
        serialized = {"timestamps": time.time()}
        for idx, key in enumerate(self.MONITORING_VARIABLE_KEYS):
            if self.monitorVariables[idx] == True:
                serialized[key] = self.state_variables[key]
        return serialized

    def parseMonitorResponse(self, commandResponse):
        if "all" in commandResponse:
            varStr = commandResponse.replace("all:", "")
            states = varStr.rstrip().split("\t", 7)

            self.state_variables["target"] = states[0]
            self.state_variables["volt_q"] = states[1]
            self.state_variables["volt_d"] = states[2]
            self.state_variables["curr_q"] = states[3]
            self.state_variables["curr_d"] = states[4]
            self.state_variables["velocity"] = states[5]
            self.state_variables["angle"] = states[6]

        if "target" in commandResponse:
            try:
                self.state_variables["target"] = float(
                    commandResponse.replace("target:", "")
                )
            except ValueError:
                print(commandResponse)
        elif "Vq" in commandResponse:
            self.state_variables["volt_q"] = float(commandResponse.replace("Vq:", ""))
        elif "Vd" in commandResponse:
            self.state_variables["volt_d"] = float(commandResponse.replace("Vd:", ""))
        elif "Cq" in commandResponse:
            self.state_variables["curr_q"] = float(commandResponse.replace("Cq:", ""))
        elif "Cd" in commandResponse:
            self.state_variables["curr_d"] = float(commandResponse.replace("Cd:", ""))
        elif "vel" in commandResponse:
            self.state_variables["velocity"] = float(commandResponse.replace("vel:", ""))
        elif "angle" in commandResponse:
            self.state_variables["angle"] = float(commandResponse.replace("angle:", ""))

    def parseResponses(self, commandResponse):
        if "PID vel" in commandResponse:
            commandResponse = commandResponse.replace("PID vel|", "")
            self.parsePIDFResponse(self.PIDVelocity, self.LPFVelocity, commandResponse)
        elif "PID angle" in commandResponse:
            commandResponse = commandResponse.replace("PID angle|", "")
            self.parsePIDFResponse(self.PIDAngle, self.LPFAngle, commandResponse)
        elif "PID curr q" in commandResponse:
            commandResponse = commandResponse.replace("PID curr q|", "")
            self.parsePIDFResponse(self.PIDCurrentQ, self.LPFCurrentQ, commandResponse)
        elif "PID curr d" in commandResponse:
            commandResponse = commandResponse.replace("PID curr d|", "")
            self.parsePIDFResponse(self.PIDCurrentD, self.LPFCurrentD, commandResponse)
        elif "Limits" in commandResponse:
            commandResponse = commandResponse.replace("Limits|", "")
            self.parseLimitsResponse(commandResponse)
        elif "Motion" in commandResponse:
            commandResponse = commandResponse.replace("Motion:", "")
            self.parseMotionResponse(commandResponse)
        elif "Torque" in commandResponse:
            commandResponse = commandResponse.replace("Torque:", "")
            self.parseTorqueResponse(commandResponse)
        elif "Sensor" in commandResponse:
            commandResponse = commandResponse.replace("Sensor |", "")
            self.parseSensorResponse(commandResponse)
        elif "Monitor" in commandResponse:
            commandResponse = commandResponse.replace("Monitor |", "")
            self.parseMonitorResponse(commandResponse)
        elif "Status" in commandResponse:
            self.deviceStatus = float(commandResponse.replace("Status:", ""))
        elif "R phase" in commandResponse:
            self.phaseResistance = float(commandResponse.replace("R phase:", ""))
        elif "PWM Mod" in commandResponse:
            commandResponse = commandResponse.replace("PWM Mod | ", "")
            self.parsePWMModResponse(commandResponse)

    def parseStateResponses(self, commandResponse):
        if "Monitor" in commandResponse:
            commandResponse = commandResponse.replace("Monitor |", "")
            self.parseMonitorResponse(commandResponse)
