#!/usr/bin/env python
# -*- coding: utf-8 -*-
""" This module contains ans script to start the SimpleFOC ConfigTool, a GUI
    application ta monitor, tune and configure BLDC motor controllers based on
    SimpleFOC library.
"""

DEFAULT_SAVE_PATH = "saved_configurations"
PORT = 7385
USE_HTTPS = False

if __name__ == "__main__":
    from src.gui_new.main import run_webui
    run_webui(DEFAULT_SAVE_PATH,PORT,USE_HTTPS)
