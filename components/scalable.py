"""
A Scalable container can be resized by selecting its resize arrows.
The Scalable object is responsible for creating the resize arrows

author: David den Uyl (djdenuyl@gmail.nl)
date: 2022-04-10
"""
from components.mutable import Mutable
from components.scale_arrow import ScaleArrow
from tkinter import SE, SW, NE, NW, S, W, N, E


class Scalable(Mutable):
    """ A Scalable implements methods to scale a container. """
    def __init__(self, container):
        super().__init__(container)
        self._add_binding("<ButtonPress-1>", self.on_press)
        self._add_binding("<ButtonRelease-1>", self.on_release)

    def on_press(self, event):
        """ on click, execute select function if the widget does not have the 'selected' tag.
        no nothing if it is already selected """
        # if widget not selected, select it
        if 'selected' in self.tags \
                and 'selection_event' in self.tags:
            self._draw_arrows()
            self._add_tag('scale_arrows_active')
            self._add_tag('scale_arrows_selection_event')

        # debug statement
        self._debug(event)

    def on_release(self, event):
        """ on release, remove resize arrow selection event tag"""
        if 'scale_arrows_selection_event' in self.tags:
            self._remove_tag('scale_arrows_selection_event')

        # debug statement
        self._debug(event)

    def _draw_arrows(self):
        """ draws the resizing arrows around the bounding box. """
        # collect the window coords
        left, top, right, bottom = self.bbox
        length = bottom - top
        width = right - left

        xs = [left + width / 2, left, left, left, right - width / 2, right, right, right]
        ys = [top, top, top + length / 2, bottom, bottom, bottom, bottom - length / 2, top]
        directions = [S, SE, E, NE, N, NW, W, SW]

        arrows = []
        rotation = 0
        for d, x, y in zip(directions, xs, ys):
            arrows.append(
                ScaleArrow(self.container, x, y, d, rotation)
            )

            rotation += 45
