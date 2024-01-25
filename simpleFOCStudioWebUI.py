#!/usr/bin/env python
# -*- coding: utf-8 -*-
""" This module contains ans script to start the SimpleFOC ConfigTool, a GUI
    application ta monitor, tune and configure BLDC motor controllers based on
    SimpleFOC library.
"""

#!/usr/bin/env python
# -*- coding: utf-8 -*-
""" This module contains ans script to start the SimpleFOC ConfigTool, a GIU
    application ta monitor, tune and configure BLDC motor controllers based on
    SimpleFOC library.
"""
USE_OLD_GUI = False

if __name__ == "__main__":
    if USE_OLD_GUI:
        from PyQt5 import QtWidgets, QtCore
        from src.gui.mainWindow import UserInteractionMainWindow
        import sys
        import logging

        try:
            QtWidgets.QApplication.setAttribute(QtCore.Qt.AA_EnableHighDpiScaling, True)
            QtWidgets.QApplication.setAttribute(QtCore.Qt.AA_UseHighDpiPixmaps, True)
            logging.basicConfig(
                filename=".SimpleFOCConfigTool.log",
                filemode="w",
                format="%(name)s - %(levelname)s - %(message)s",
            )
            app = QtWidgets.QApplication(sys.argv)
            mainWindow = QtWidgets.QMainWindow()
            userInteractionMainWindow = UserInteractionMainWindow()
            userInteractionMainWindow.setupUi(mainWindow)
            mainWindow.show()
            sys.exit(app.exec_())
        except Exception as exception:
            logging.error(exception, exc_info=True)
    else:
        from src.gui_new.main import run_webui

        run_webui()
