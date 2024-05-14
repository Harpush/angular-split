import { NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import { SplitComponent } from './component/split.component'
import { SplitAreaDirective } from './directive/split-area.directive'
import { SplitGutterDirective } from './gutter/split-gutter.directive'
import { SplitGutterDragHandleDirective } from './gutter/split-gutter-drag-handle.directive'
import { SplitGutterDynamicInjectorDirective } from './gutter/split-gutter-dynamic-injector.directive'
import { SplitGutterExcludeFromDragDirective } from './gutter/split-gutter-exclude-from-drag.directive'
import { NewSplitAreaComponent } from './new/new-split-area/new-split-area.component'
import { NewSplitComponent } from './new/new-split/new-split.component'

@NgModule({
  imports: [CommonModule, NewSplitAreaComponent, NewSplitComponent],
  declarations: [
    SplitComponent,
    SplitAreaDirective,
    SplitGutterDirective,
    SplitGutterDragHandleDirective,
    SplitGutterDynamicInjectorDirective,
    SplitGutterExcludeFromDragDirective,
  ],
  exports: [
    SplitComponent,
    SplitAreaDirective,
    SplitGutterDirective,
    SplitGutterDragHandleDirective,
    SplitGutterExcludeFromDragDirective,
    NewSplitAreaComponent,
    NewSplitComponent,
  ],
})
export class AngularSplitModule {}
