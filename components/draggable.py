"""
Drag and Drop widget canvas for Images

adapted from: https://raw.githubusercontent.com/python/cpython/main/Lib/tkinter/dnd.py

author: David den Uyl (ddenuyl@gmail.com)
date: 2022-01-26
"""


class Draggable:
    """ A Container for a widget that can be dragged and dropped. It is the liaison between the image and the canvas """
    def __init__(self, master, widget, anchor, window):
        self.master = master
        self.widget = widget
        self.anchor = anchor
        self.window = window

        self.x_offset = None
        self.y_offset = None
        self.x_original = None
        self.y_original = None

        self.widget.bind("<ButtonPress-1>", self.on_click)
        self.widget.bind("<B1-Motion>", self.on_drag)
        self.widget.bind("<ButtonRelease-1>", self.on_drop)

    def on_click(self, event):
        """ on click, set the original widget location """
        # collect the x,y event offset
        self.x_offset = event.x
        self.y_offset = event.y

        # collect the original x,y coords
        self.x_original, self.y_original = self.master.coords(self.window)

    def on_drag(self, event):
        """ on drag, move the widget """
        x, y = self.position(event)
        self.master.coords(self.window, x, y)

    def on_drop(self, event):
        """ On drop, delete the original window and create a new one at the new location """
        x, y = self.position(event)

        # self.master.delete(self.window)
        # self.window = self.master.create_window(x, y, window=self.widget, anchor="nw")
        self.master.coords(self.window, x, y)

    def position(self, event):
        """ keep track of the widgets position """
        # where the corner of the canvas is relative to the screen:
        x_master = self.master.winfo_rootx()
        y_master = self.master.winfo_rooty()

        # where the pointer is relative to the canvas widget:
        x = event.x_root - x_master
        y = event.y_root - y_master

        # compensate for initial pointer offset
        return x - self.x_offset, y - self.y_offset
