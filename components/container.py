"""
Drag and Drop widget canvas for Images

adapted from: https://raw.githubusercontent.com/python/cpython/main/Lib/tkinter/dnd.py

author: David den Uyl (ddenuyl@gmail.com)
date: 2022-01-26
"""
from PIL import Image
from PIL.ImageTk import PhotoImage
from tkinter import Label, NW, Frame
from components.draggable import Draggable
from components.selectable import Selectable
from components.scalable import Scalable


class Container(Frame):
    """ A Container for a widget that can be dragged and dropped. It is the liaison between the image and the canvas """
    _x = 10
    _y = 10

    def __init__(self, master, image_path, x=None, y=None, anchor=None):
        super().__init__(master)
        self.master = master
        self.image_path = image_path
        self.image = Image.open(self.image_path)
        self.image_tk = PhotoImage(self.image, Image.ANTIALIAS)
        self.anchor = anchor or NW

        self.x = x or self._x
        self.y = y or self._y

        self.widget = Label(self.master,
                            image=self.image_tk,
                            height=self.image_tk.height(),
                            width=self.image_tk.width(),
                            bg='white'
                            )

        # create the window containing the image
        self.window = self.master \
            .create_window(self.x,
                           self.y,
                           window=self.widget,
                           anchor=self.anchor
                           )

        # make container selectable
        self.selectable = Selectable(self.master, self.widget, self.window)

        # make container draggable
        self.draggable = Draggable(self.master, self.widget, self.window)

        # make container scalable
        self.scalable = Scalable(self)
