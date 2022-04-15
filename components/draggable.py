"""
Drag and Drop widget canvas for Images

author: David den Uyl (ddenuyl@gmail.com)
date: 2022-01-26
"""
from components.mutable import Mutable


class Draggable(Mutable):
    """ A Draggable implements functionality to drag a container across the canvas"""
    def __init__(self, container):
        super().__init__(container)
        self._event_x = None
        self._event_y = None

        self._add_binding('<ButtonPress-1>', self.on_press)
        self._add_binding('<B1-Motion>', self.on_drag)

    def on_press(self, event):
        """ on click, set the original widget location """
        # collect the x,y event
        self._event_x = event.x
        self._event_y = event.y

        # debug statement
        self._debug(event)

    def on_drag(self, event):
        """ on drag, move all canvas items with 'selected' tag """

        # deltas to move
        dx = event.x - self._event_x
        dy = event.y - self._event_y

        # reset the start
        self._event_x = event.x
        self._event_y = event.y

        # move all selected
        [self._move(i, dx, dy) for i in self._tagged('selected')]
