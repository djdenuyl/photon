"""
Generic drag and droppable widget

adapted from: https://raw.githubusercontent.com/python/cpython/main/Lib/tkinter/dnd.py

author: David den Uyl (ddenuyl@gmail.com)
date: 2022-01-26
"""
from tkinter import Label
from handlers.dnd_handler import dnd_start


class Draggable:
    """ A widget that can be dragged and dropped """
    def __init__(self, image):
        self.image = image
        self.canvas = None
        self.label = None
        self.id = None

        self.x_off = None
        self.y_off = None
        self.x_orig = None
        self.y_orig = None

    def attach(self, canvas, x=10, y=10):
        """ Attach draggable to canvas """
        if canvas is self.canvas:
            self.canvas.coords(self.id, x, y)
            return

        if self.canvas is not None:
            self.detach()

        if canvas is None:
            return

        self.canvas = canvas
        self.label = Label(canvas,
                           image=self.image,
                           borderwidth=2,
                           relief="raised",
                           height=self.image.height(),
                           width=self.image.width()
                           )
        self.id = canvas.create_window(x, y, window=self.label, anchor="nw")
        self.label.bind("<ButtonPress>", self.press)

    def detach(self):
        """ detach the draggable from canvas """
        if self.canvas is None:
            return
        self.canvas.delete(self.id)
        self.label.destroy()
        self.canvas = None
        self.label = None
        self.id = None

    def press(self, event):
        """ set the x,y coords on button press """

        # if this widget is clicked
        if dnd_start(self, event):

            # collect the x,y offset
            self.x_off = event.x
            self.y_off = event.y

            # collect the original x,y coords
            self.x_orig, self.y_orig = self.canvas.coords(self.id)

    def move(self, event):
        """ move the widget """
        x, y = self.where(self.canvas, event)
        self.canvas.coords(self.id, x, y)

    def putback(self):
        """ put the widget back where it was """
        self.canvas.coords(self.id, self.x_orig, self.y_orig)

    def where(self, canvas, event):
        """ keep track of the widgets position """
        # where the corner of the canvas is relative to the screen:
        x_org = canvas.winfo_rootx()
        y_org = canvas.winfo_rooty()

        # where the pointer is relative to the canvas widget:
        x = event.x_root - x_org
        y = event.y_root - y_org

        # compensate for initial pointer offset
        return x - self.x_off, y - self.y_off

    def dnd_end(self, target, event):
        pass
