#!/bin/bash
#Author : multisystem https://community.simplefoc.com/t/simplefoc-webui-based-on-simplefoc-studio-and-without-webserial/4385/7?u=giant_bee

_CONDA_ROOT="$HOME/anaconda3"
_INSTALL_ROOT="$HOME/SimpleFOCWebUI"
_PYTHON_ROOT="python3.11"

\. "$_CONDA_ROOT/etc/profile.d/conda.sh" || return $?
conda activate "simplefoc"
cd $_INSTALL_ROOT
x-terminal-emulator -e $_PYTHON_ROOT -i simpleFOCStudioWebUI.py&
sleep 1
xdg-open http://localhost:7385
exit 0
