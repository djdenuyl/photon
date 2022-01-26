"""
The main album canvas

author: David den Uyl (ddenuyl@bebr.nl)
date: 2022-01-25
"""
from tkinter import Canvas, CENTER


class MainCanvas(Canvas):
    """ Represents the main canvas in the application that holds the album """
    def __init__(self, **kw):
        super().__init__(**kw)

        self.image = None
        self.canvas_image = self.create_image(self.winfo_width()/2,
                                              self.winfo_height()/2,
                                              anchor=CENTER,
                                              image=self.image
                                              )
