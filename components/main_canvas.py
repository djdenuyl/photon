"""
The main album canvas

author: David den Uyl (ddenuyl@bebr.nl)
date: 2022-01-25
"""
from tkinter import Canvas
from components.container import Container


class MainCanvas(Canvas):
    """ Represents the main canvas in the application that holds the album """
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.containers = []
        self.containers.append(Container(self, image_path='data/ball.png'))
