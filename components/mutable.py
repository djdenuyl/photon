""""
Parent class for any class that can perform a mutation on the container object, such as rotation, scaling etc
implements common methods

author: David den Uyl (ddenuyl@gmail.com)
date: 2022-04-15
"""
from logging import debug


class Mutable:
    def __init__(self, container):
        self.container = container
        self.canvas = self.container.canvas

    @property
    def tags(self):
        """ get all the container tags"""
        return self.canvas.gettags(self.container.id)

    @property
    def bbox(self):
        """ get the container bbox """
        return self.canvas.bbox(self.container.id)

    def _add_binding(self, button, function):
        """ add a binding to the container """
        self.canvas.tag_bind(self.container.id, button, function, add='+')

    def _add_tag(self, tag):
        """ add a tag to the container"""
        self.canvas.addtag_withtag(tag, self.container.id)

    def _remove_tag(self, tag):
        """ remove a tag from the container"""
        self.canvas.dtag(self.container.id, tag)

    def _debug(self, event):
        """ log debug statement """
        debug(f'event: {event}, '
              f'obj: {self.__class__.__name__}, '
              f'id: {self.container.id}, '
              f'tags: {self.tags}')
