"""
Enum representation of tkinter -relief options

author: David den Uyl (djdenuyl@gmail.com)
date: 2022-01-19
"""
from enum import Enum
from tkinter import FLAT, SUNKEN, RAISED, GROOVE, RIDGE


class BorderEffectOption(Enum):
    """ represents a -relief option for the border of a frame """
    FLAT = FLAT
    SUNKEN = SUNKEN
    RAISED = RAISED
    GROOVE = GROOVE
    RIDGE = RIDGE
