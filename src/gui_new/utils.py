import serial

DEFAULT_PARAMS = {
    
}

class LOG_SEVERITY:
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    DEBUG = "debug"


class SERIAL_MONITOR_DATA_TYPE:
    MONITORING = "Monitoring"
    STATES = "States"
    COMMAND = "Command"


def to_serial_size(serial_byte_size):
    if serial_byte_size == "5":
        return serial.FIVEBITS
    elif serial_byte_size == "6":
        return serial.SIXBITS
    elif serial_byte_size == "7":
        return serial.SEVENBITS
    elif serial_byte_size == "8":
        return serial.EIGHTBITS


def to_serial_parity(serial_parity):
    if serial_parity == "None":
        return serial.PARITY_NONE
    elif serial_parity == "Even":
        return serial.PARITY_EVEN
    elif serial_parity == "Odd":
        return serial.PARITY_ODD
    elif serial_parity == "Mark":
        return serial.PARITY_MARK
    elif serial_parity == "Space":
        return serial.PARITY_SPACE
    else:
        # Handle invalid input, you can raise an exception or return a default value
        raise ValueError("Invalid parity value: {}".format(serial_parity))


def to_stop_bits(serial_stop_bits):
    if serial_stop_bits == "1":
        return serial.STOPBITS_ONE
    elif serial_stop_bits == "1.5":
        return serial.STOPBITS_ONE_POINT_FIVE
    elif serial_stop_bits == "2":
        return serial.STOPBITS_TWO
