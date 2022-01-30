"""
Drag and Drop widget container for Images

adapted from: https://raw.githubusercontent.com/python/cpython/main/Lib/tkinter/dnd.py

author: David den Uyl (ddenuyl@gmail.com)
date: 2022-01-26
"""
from tkinter import Label, PhotoImage
from components.draggable import Draggable


class Container:
    """ A Container for a widget that can be dragged and dropped. It is the liaison between the image and the canvas """
    def __init__(self, master, image: PhotoImage):
        self.master = master
        self.image = image
        self.anchor = "nw"

        self.x_original = None
        self.y_original = None
        self.x_start = 10
        self.y_start = 10

        self.widget = Label(self.master,
                            image=self.image,
                            borderwidth=2,
                            relief="raised",
                            height=self.image.height(),
                            width=self.image.width()
                            )

        self.window = self.master.create_window(self.x_start, self.y_start, window=self.widget, anchor=self.anchor)

        # make container draggable
        self.draggable = Draggable(self.master, self.widget, self.anchor, self.window)



