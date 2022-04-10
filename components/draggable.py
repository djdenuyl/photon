"""
Drag and Drop widget canvas for Images

adapted from: https://raw.githubusercontent.com/python/cpython/main/Lib/tkinter/dnd.py

author: David den Uyl (ddenuyl@gmail.com)
date: 2022-01-26
"""
from logging import debug


class Draggable:
    """ A Container for a widget that can be dragged and dropped. It is the liaison between the image and the canvas """
    def __init__(self, master, widget, window_id):
        self.master = master
        self.widget = widget
        self.window_id = window_id

        self.x_start = None
        self.y_start = None

        self.widget.bind("<ButtonPress-1>", self.on_click, add='+')
        self.widget.bind("<B1-Motion>", self.on_drag, add='+')
        self.widget.bind("<ButtonRelease-1>", self.on_release, add='+')

    def on_click(self, event):
        """ on click, set the original widget location """
        debug(f'event: {event}, {self.__class__}')

        # collect the x,y event offset
        self.x_start = event.x
        self.y_start = event.y

    def on_drag(self, event):
        """ on drag, move all canvas items with 'selected' tag """
        # if 'dragging' not in self.master.gettags(self.window_id):
        #     self.master.addtag_withtag('dragging', self.window_id)
        # debug(self.master.gettags(self.window_id))

        # deltas to move
        dx = event.x - self.x_start
        dy = event.y - self.y_start

        # move all selected
        [self.master.move(i, dx, dy) for i in self.master.find_withtag('selected')]

    def on_release(self, event):
        """ on release, remove the dragging tag """
        # debug(f'event: {event}, released: {self.window_id}')
        # self.master.dtag(self.window_id, 'dragging')


