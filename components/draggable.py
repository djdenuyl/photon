"""
Drag and Drop widget canvas for Images

author: David den Uyl (ddenuyl@gmail.com)
date: 2022-01-26
"""
from logging import debug


class Draggable:
    """ A Draggable implements functionality to drag a container across the canvas"""
    def __init__(self, master):
        self.master = master

        self.x_start = None
        self.y_start = None

        self.master.canvas.tag_bind(self.master.id, "<ButtonPress-1>", self.on_click, add='+')
        self.master.canvas.tag_bind(self.master.id, "<B1-Motion>", self.on_drag, add='+')

    def on_click(self, event):
        """ on click, set the original widget location """
        debug(f'event: {event}, {self.__class__}')

        # collect the x,y event
        self.x_start = event.x
        self.y_start = event.y

    def on_drag(self, event):
        """ on drag, move all canvas items with 'selected' tag """

        # deltas to move
        dx = event.x - self.x_start
        dy = event.y - self.y_start

        # reset the start
        self.x_start = event.x
        self.y_start = event.y

        # move all selected
        [self.master.canvas.move(i, dx, dy) for i in self.master.canvas.find_withtag('selected')]
