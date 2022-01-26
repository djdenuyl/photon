"""
The main album canvas

author: David den Uyl (ddenuyl@bebr.nl)
date: 2022-01-25
"""
from tkinter import Canvas


class MainCanvas(Canvas):
    """ Represents the main canvas in the application that holds the album """
    def __init__(self, **kw):
        super().__init__(**kw)

        self.image = None
        self.canvas_image = self.create_image(150, 100, image=self.image)
