"""
The main album canvas

author: David den Uyl (ddenuyl@bebr.nl)
date: 2022-01-25
"""
from logging import debug
from tkinter import Canvas

from handlers.file_handling import Reset


class MainCanvas(Canvas):
    """ Represents the main canvas in the application that holds the album """
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.containers = []

        # bindings
        self.bind('<Button-1>', self.deselect_all)

        Reset(self).open()

    def deselect_all(self, e):
        """ remove selection from all objects on the canvas if none are clicked in the event. """

        # go through all objects and check if the event happened within their bounding box, if so: return
        for o in self.find_all():
            _l, _t, _r, _b = self.bbox(o)
            if _l <= e.x <= _r and _t <= e.y <= _b:
                return

        # only deselect all if no objects were clicked (i.e. on empty canvas)
        debug(f'event: {e}, '
              f'func: deselect_all, '
              f'deselecting ids: {self.find_withtag("selected")}')
        # delete the bbox and corresponding arrows
        [self.delete(c) for c in self.find_withtag('to_delete')]

        # remove selected tag from objects that have it
        [self.dtag(c, 'selected') for c in self.find_withtag('selected')]
