"""
Drag and Drop widget canvas for Images

adapted from: https://raw.githubusercontent.com/python/cpython/main/Lib/tkinter/dnd.py

author: David den Uyl (ddenuyl@gmail.com)
date: 2022-01-26
"""
from PIL import Image
from PIL.ImageTk import PhotoImage
from tkinter import NW
from components.draggable import Draggable
from components.rotatable import Rotatable
from components.selectable import Selectable
from components.scalable import Scalable


class Container:
    """ A Container for a widget that can be dragged and dropped. It is the liaison between the image and the canvas """
    _x = 10
    _y = 10

    def __init__(self, canvas, image_path, x=None, y=None, anchor=None):
        self.canvas = canvas
        self.image_path = image_path
        self.image = Image.open(self.image_path)
        self.image_rotation = 0
        self.image_tk = PhotoImage(self.image, Image.ANTIALIAS)
        self.anchor = anchor or NW

        self.x = x or self._x
        self.y = y or self._y

        self.id = self.canvas.create_image(
            self.x,
            self.y,
            image=self.image_tk,
            anchor=self.anchor,
        )

        # make container selectable
        self.selectable = Selectable(self)

        # make container draggable
        self.draggable = Draggable(self)

        # make container scalable
        self.scalable = Scalable(self)

        # make container rotatable
        self.rotatable = Rotatable(self)
