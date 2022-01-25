import tkinter


def handle_it(event):
    print(event.data.something)


root = tkinter.Tk()
root.something = {1: 2}
root.after(1, lambda: root.event_generate('<<Test>>', data=root))
root.bind('<<Test>>', handle_it)
root.mainloop()
