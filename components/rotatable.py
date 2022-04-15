"""
A rotatable container allows rotation of the image it contains

author: David den Uyl (ddenuyl@gmail.com)
date: 2022-04-15
"""
from logging import debug


class Rotatable:
    def __init__(self, container):
        self.container = container
        self.canvas = self.container.canvas

        # add bindings
        self.canvas.tag_bind(self.container.id, '<ButtonPress-1>', self.on_click, add='+')

    @property
    def tags(self):
        return self.canvas.gettags(self.container.id)

    def on_click(self, event):
        """ on click create the rotation arrows, if the container is currently displaying resize arrows"""
        debug(f'event: {event}')

        if 'scale_arrows_active' in self.tags \
                and 'scale_arrows_selection_event' not in self.tags:
            # delete old arrows
            [self.canvas.delete(a) for a in self.canvas.find_withtag('scale_arrow')]

            # draw new arrows
            self._draw_arrows()

            # add new arrow tag
            self.canvas.addtag_withtag('rotation_arrows_active', self.container.id)

    @staticmethod
    def _draw_arrows(self):
        print('drawing arrows')
